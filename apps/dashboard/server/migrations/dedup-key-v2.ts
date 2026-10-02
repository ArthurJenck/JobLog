import { randomUUID } from 'node:crypto';
import {
  JOB_SOURCES,
  TERMINAL_STATUSES,
  deriveStatusFromEvents,
  type ApplicationStatus,
  type EventType,
  type JobSource,
} from '@joblog/shared';
import { type ClientSession, type Db, type Document, ObjectId } from 'mongodb';
import { getDb } from '../../lib/db.js';
import { resolveJobPostingIdentity } from '../job-postings/url-identity.js';
import { isDedupMigrationMaintenanceActive } from './maintenance.js';

const MIGRATION_KEY = 'dedup-key-v2';
const LEASE_DURATION_MS = 5 * 60 * 1000;

interface MigrationOptions {
  dryRun?: boolean;
  batchSize?: number;
  ownerId?: string;
}

export interface DedupMigrationAnalysis {
  applicationCollisions: number;
  collisionGroups: number;
  invalidJobPostings: Array<{ id: string; reason: string }>;
  jobPostings: number;
  legacyJobPostings: number;
  orphanAnalyses: number;
  orphanApplications: number;
  reminderCleanup: ReminderCleanupReport;
  statusFallbacks: number;
}

export interface DedupMigrationResult {
  analysis: DedupMigrationAnalysis;
  dryRun: boolean;
  invariants: Record<string, number> | null;
  mergedApplicationGroups: number;
  mergedJobPostingGroups: number;
  processed: number;
  reminderCleanup: ReminderCleanupReport | null;
  statusFallbacks: number;
}

export interface ReminderCleanupReport {
  ambiguous: number;
  missingEnabled: number;
  obsolete: number;
  terminal: number;
  updated: number;
}

interface JobPostingMigrationDoc extends Document {
  _id: ObjectId;
  userId?: unknown;
  url?: unknown;
  url_hash?: unknown;
  dedup_key?: unknown;
  source?: JobSource;
  source_key?: unknown;
  native_job_id?: unknown;
  title?: unknown;
  company?: unknown;
  location?: unknown;
}

interface ApplicationMigrationDoc extends Document {
  _id: ObjectId;
  userId: string;
  jobPostingId: string;
  status?: ApplicationStatus;
  events?: Array<{ type: EventType; at: Date; meta: unknown }>;
  reminder?: {
    enabled?: boolean;
    at?: Date | string | null;
    frequencyDays?: number;
    sentCount?: number;
    snoozedUntil?: Date | string | null;
  } | null;
}

export async function runDedupKeyV2Migration(
  options: MigrationOptions = {},
): Promise<DedupMigrationResult> {
  const db = await getDb();
  const analysis = await analyzeDedupKeyV2Migration(db);
  if (options.dryRun ?? true) {
    return {
      analysis,
      dryRun: true,
      invariants: null,
      mergedApplicationGroups: 0,
      mergedJobPostingGroups: 0,
      processed: 0,
      reminderCleanup: null,
      statusFallbacks: analysis.statusFallbacks,
    };
  }

  if (analysis.invalidJobPostings.length > 0 || analysis.orphanApplications > 0) {
    throw new Error('Migration refused because invalid references remain unclassified');
  }

  const ownerId = options.ownerId ?? randomUUID();
  if (!await isDedupMigrationMaintenanceActive(ownerId)) {
    throw new Error('Migration execution requires a maintenance lock owned by this process');
  }
  await ensureMigrationInfrastructure(db);
  await acquireLease(db, ownerId);

  try {
    await prepareMigrationIndexes(db);
    const processed = await backfillJobPostingIdentities(db, ownerId, options.batchSize ?? 250);
    const mergeResult = await mergeAllCollisions(db, ownerId);
    const reminderCleanup = await cleanupApplicationReminders(db, ownerId, options.batchSize ?? 250);
    await deleteOrphanAnalyses(db, ownerId);
    await createFinalIndexes(db);
    const invariants = await verifyDedupKeyV2Invariants(db);
    const failedInvariant = Object.values(invariants).some((count) => count > 0);
    if (failedInvariant) throw new Error(`Migration invariants failed: ${JSON.stringify(invariants)}`);

    await db.collection('migration_progress').updateOne(
      { key: MIGRATION_KEY },
      {
        $set: {
          phase: 'complete',
          completedAt: new Date(),
          ownerId,
          processed,
          reminderCleanup,
          ...mergeResult,
        },
      },
      { upsert: true },
    );

    return {
      analysis,
      dryRun: false,
      invariants,
      ...mergeResult,
      processed,
      reminderCleanup,
    };
  } finally {
    await db.collection('migration_leases').deleteOne({ key: MIGRATION_KEY, ownerId });
  }
}

async function ensureMigrationInfrastructure(db: Db) {
  await db.collection('migration_leases').createIndex({ key: 1 }, { unique: true });
  await db.collection('migration_leases').createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 },
  );
  await db.collection('migration_progress').createIndex({ key: 1 }, { unique: true });
  await db.collection('application_aliases').createIndex(
    { userId: 1, legacyApplicationId: 1 },
    { unique: true },
  );
  await db.collection('job_posting_aliases').createIndex(
    { userId: 1, legacyJobPostingId: 1 },
    { unique: true, partialFilterExpression: { legacyJobPostingId: { $type: 'string' } } },
  );
  await db.collection('job_posting_aliases').createIndex(
    { userId: 1, legacyKey: 1 },
    { unique: true, partialFilterExpression: { legacyKey: { $type: 'string' } } },
  );
}

export async function analyzeDedupKeyV2Migration(db: Db): Promise<DedupMigrationAnalysis> {
  const jobPostings = db.collection<JobPostingMigrationDoc>('job_postings');
  const applications = db.collection<ApplicationMigrationDoc>('applications');
  const jobOwners = new Map<string, string>();
  const jobTargetKeys = new Map<string, string>();
  const dedupGroups = new Map<string, number>();
  const invalidJobPostings: Array<{ id: string; reason: string }> = [];
  let count = 0;
  let legacyCount = 0;

  for await (const job of jobPostings.find({})) {
    count += 1;
    if (typeof job.userId === 'string') jobOwners.set(job._id.toString(), job.userId);
    if (typeof job.dedup_key !== 'string') legacyCount += 1;
    try {
      const identity = identityForMigration(job);
      if (typeof job.userId !== 'string' || !job.userId) throw new Error('missing userId');
      const groupKey = `${job.userId}\0${identity.dedupKey}`;
      jobTargetKeys.set(job._id.toString(), groupKey);
      dedupGroups.set(groupKey, (dedupGroups.get(groupKey) ?? 0) + 1);
    } catch (error) {
      invalidJobPostings.push({
        id: job._id.toString(),
        reason: error instanceof Error ? error.message : 'unknown identity error',
      });
    }
  }

  let orphanApplications = 0;
  const reminderCleanup: ReminderCleanupReport = {
    ambiguous: 0,
    missingEnabled: 0,
    obsolete: 0,
    terminal: 0,
    updated: 0,
  };
  const applicationGroups = new Map<string, ApplicationMigrationDoc[]>();
  for await (const application of applications.find({})) {
    if (jobOwners.get(application.jobPostingId) !== application.userId) orphanApplications += 1;
    const key = jobTargetKeys.get(application.jobPostingId)
      ?? `${application.userId}\0invalid:${application.jobPostingId}`;
    const group = applicationGroups.get(key) ?? [];
    group.push(application);
    applicationGroups.set(key, group);
    addReminderDecisionToReport(reminderCleanup, getReminderCleanupDecision(application));
  }

  let orphanAnalyses = 0;
  for await (const analysis of db.collection('cv_analyses').find(
    {},
    { projection: { userId: 1, jobPostingId: 1 } },
  )) {
    if (
      typeof analysis.jobPostingId !== 'string'
      || typeof analysis.userId !== 'string'
      || jobOwners.get(analysis.jobPostingId) !== analysis.userId
    ) {
      orphanAnalyses += 1;
    }
  }

  return {
    applicationCollisions: [...applicationGroups.values()].filter((value) => value.length > 1).length,
    collisionGroups: [...dedupGroups.values()].filter((value) => value > 1).length,
    invalidJobPostings,
    jobPostings: count,
    legacyJobPostings: legacyCount,
    orphanAnalyses,
    orphanApplications,
    reminderCleanup,
    statusFallbacks: [...applicationGroups.entries()].filter(
      ([key, documents]) =>
        (documents.length > 1 || (dedupGroups.get(key) ?? 0) > 1)
        && applicationStatusFallbackRequired(documents),
    ).length,
  };
}

async function acquireLease(db: Db, ownerId: string) {
  const now = new Date();
  try {
    const lease = await db.collection('migration_leases').findOneAndUpdate(
      {
        key: MIGRATION_KEY,
        $or: [{ expiresAt: { $lte: now } }, { ownerId }],
      },
      {
        $set: {
          ownerId,
          acquiredAt: now,
          expiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
        },
        $setOnInsert: { key: MIGRATION_KEY },
      },
      { upsert: true, returnDocument: 'after' },
    );
    if (!lease || lease.ownerId !== ownerId) throw new Error('Migration lease is already held');
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new Error('Migration lease is already held', { cause: error });
    }
    throw error;
  }
}

async function renewLease(db: Db, ownerId: string, session?: ClientSession) {
  const result = await db.collection('migration_leases').updateOne(
    { key: MIGRATION_KEY, ownerId },
    { $set: { expiresAt: new Date(Date.now() + LEASE_DURATION_MS) } },
    { session },
  );
  if (result.matchedCount === 0) throw new Error('Migration lease was lost');
}

async function prepareMigrationIndexes(db: Db) {
  await db.collection('job_postings').dropIndex('userId_1_dedup_key_1').catch(() => undefined);
}

async function backfillJobPostingIdentities(db: Db, ownerId: string, batchSize: number) {
  const progress = await db.collection('migration_progress').findOne({ key: MIGRATION_KEY });
  const lastId = progress?.phase === 'backfill' && typeof progress.lastId === 'string'
    && ObjectId.isValid(progress.lastId)
    ? new ObjectId(progress.lastId)
    : null;
  const jobPostings = db.collection<JobPostingMigrationDoc>('job_postings');
  let cursorId = lastId;
  let processed = progress?.phase === 'backfill' && typeof progress.processed === 'number'
    ? progress.processed
    : 0;

  while (true) {
    const jobs = await jobPostings.find(
      cursorId ? { _id: { $gt: cursorId } } : {},
      { sort: { _id: 1 }, limit: batchSize },
    ).toArray();
    if (jobs.length === 0) break;

    const operations = jobs.map((job) => {
      const identity = identityForMigration(job);
      return {
        updateOne: {
          filter: { _id: job._id },
          update: {
            $set: {
              dedup_key: identity.dedupKey,
              dedup_version: 2,
              source: identity.source,
              source_key: identity.sourceKey,
              ...(identity.nativeJobId ? { native_job_id: identity.nativeJobId } : {}),
              url: identity.canonicalUrl,
            },
          },
        },
      };
    });
    await jobPostings.bulkWrite(operations, { ordered: true });

    const aliasOperations = jobs.flatMap((job) => {
      if (typeof job.userId !== 'string') return [];
      const legacyJobPostingId = job._id.toString();
      const targetJobPostingId = job._id.toString();
      const createdAt = new Date();
      const idAlias = {
        updateOne: {
          filter: { userId: job.userId, legacyJobPostingId },
          update: { $setOnInsert: { userId: job.userId, legacyJobPostingId, targetJobPostingId, createdAt } },
          upsert: true,
        },
      };
      if (typeof job.url_hash !== 'string') return [idAlias];
      return [
        idAlias,
        {
          updateOne: {
            filter: { userId: job.userId, legacyKey: job.url_hash },
            update: {
              $setOnInsert: {
                userId: job.userId,
                legacyKey: job.url_hash,
                targetJobPostingId,
                createdAt,
              },
            },
            upsert: true,
          },
        },
      ];
    });
    if (aliasOperations.length > 0) {
      await db.collection('job_posting_aliases').bulkWrite(aliasOperations, { ordered: false });
    }

    cursorId = jobs.at(-1)?._id ?? cursorId;
    processed += jobs.length;
    await renewLease(db, ownerId);
    await db.collection('migration_progress').updateOne(
      { key: MIGRATION_KEY },
      {
        $set: {
          phase: 'backfill',
          lastId: cursorId?.toString() ?? null,
          processed,
          ownerId,
          updatedAt: new Date(),
        },
        $setOnInsert: { key: MIGRATION_KEY, startedAt: new Date() },
      },
      { upsert: true },
    );
  }

  await db.collection('migration_progress').updateOne(
    { key: MIGRATION_KEY },
    { $set: { phase: 'collisions', ownerId, updatedAt: new Date() } },
    { upsert: true },
  );
  return processed;
}

async function mergeAllCollisions(db: Db, ownerId: string) {
  let mergedJobPostingGroups = 0;
  let mergedApplicationGroups = 0;
  let statusFallbacks = 0;

  while (true) {
    const collision = await db.collection('job_postings').aggregate<{
      _id: { userId: string; dedupKey: string };
      count: number;
    }>([
      { $match: { userId: { $type: 'string' }, dedup_key: { $type: 'string' } } },
      { $group: { _id: { userId: '$userId', dedupKey: '$dedup_key' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).next();
    if (!collision) break;

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        await renewLease(db, ownerId, session);
        const result = await mergeCollisionGroup(
          db,
          collision._id.userId,
          collision._id.dedupKey,
          session,
        );
        mergedApplicationGroups += result.mergedApplicationGroups;
        statusFallbacks += result.statusFallbacks;
      });
      mergedJobPostingGroups += 1;
    } finally {
      await session.endSession();
    }
  }

  while (true) {
    const collision = await db.collection('applications').aggregate<{
      _id: { userId: string; jobPostingId: string };
      count: number;
    }>([
      { $group: { _id: { userId: '$userId', jobPostingId: '$jobPostingId' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).next();
    if (!collision) break;

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        await renewLease(db, ownerId, session);
        statusFallbacks += await mergeApplicationCollisionGroup(
          db,
          collision._id.userId,
          collision._id.jobPostingId,
          session,
        );
      });
      mergedApplicationGroups += 1;
    } finally {
      await session.endSession();
    }
  }

  return { mergedApplicationGroups, mergedJobPostingGroups, statusFallbacks };
}

async function mergeApplicationCollisionGroup(
  db: Db,
  userId: string,
  jobPostingId: string,
  session: ClientSession,
) {
  const applications = db.collection<ApplicationMigrationDoc>('applications');
  const documents = await applications.find({ userId, jobPostingId }, { session }).toArray();
  if (documents.length < 2) return 0;
  const ranked = [...documents].sort(compareApplications);
  const statusFallback = applicationStatusFallbackRequired(ranked) ? 1 : 0;
  const survivor = ranked[0];
  const losers = ranked.slice(1);
  await applications.updateOne(
    { _id: survivor._id, userId },
    { $set: mergeApplicationDocuments(ranked, jobPostingId) },
    { session },
  );
  await db.collection('application_aliases').bulkWrite(
    losers.map((application) => ({
      updateOne: {
        filter: { userId, legacyApplicationId: application._id.toString() },
        update: {
          $setOnInsert: {
            userId,
            legacyApplicationId: application._id.toString(),
            targetApplicationId: survivor._id.toString(),
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    })),
    { session },
  );
  await db.collection('application_aliases').updateMany(
    {
      userId,
      targetApplicationId: { $in: losers.map((application) => application._id.toString()) },
    },
    { $set: { targetApplicationId: survivor._id.toString() } },
    { session },
  );
  await db.collection('migration_dedup_log').updateOne(
    { migrationKey: MIGRATION_KEY, survivorJobPostingId: jobPostingId },
    {
      $set: {
        userId,
        survivorApplicationId: survivor._id.toString(),
        mergedApplicationIds: losers.map((application) => application._id.toString()),
        updatedAt: new Date(),
      },
      $setOnInsert: {
        migrationKey: MIGRATION_KEY,
        survivorJobPostingId: jobPostingId,
        createdAt: new Date(),
      },
    },
    { upsert: true, session },
  );
  await applications.deleteMany(
    { _id: { $in: losers.map((application) => application._id) }, userId },
    { session },
  );
  return statusFallback;
}

async function mergeCollisionGroup(
  db: Db,
  userId: string,
  dedupKey: string,
  session: ClientSession,
) {
  const jobPostings = db.collection<JobPostingMigrationDoc>('job_postings');
  const jobs = await jobPostings.find({ userId, dedup_key: dedupKey }, { session }).toArray();
  if (jobs.length < 2) return { mergedApplicationGroups: 0, statusFallbacks: 0 };

  const ranked = [...jobs].sort(compareJobPostings);
  const survivor = ranked[0];
  const losers = ranked.slice(1);
  const survivorId = survivor._id.toString();
  const allIds = jobs.map((job) => job._id.toString());
  const applications = db.collection<ApplicationMigrationDoc>('applications');
  const relatedApplications = await applications.find(
    { userId, jobPostingId: { $in: allIds } },
    { session },
  ).toArray();

  let mergedApplicationGroups = 0;
  let statusFallbacks = 0;
  let survivingApplicationId: string | null = null;
  if (relatedApplications.length > 0) {
    const sortedApplications = [...relatedApplications].sort(compareApplications);
    if (applicationStatusFallbackRequired(sortedApplications)) statusFallbacks = 1;
    const applicationSurvivor = sortedApplications[0];
    survivingApplicationId = applicationSurvivor._id.toString();
    const applicationLosers = sortedApplications.slice(1);
    const mergedApplication = mergeApplicationDocuments(sortedApplications, survivorId);

    if (applicationLosers.length > 0) {
      const aliasOperations = applicationLosers.map((application) => ({
        updateOne: {
          filter: { userId, legacyApplicationId: application._id.toString() },
          update: {
            $setOnInsert: {
              userId,
              legacyApplicationId: application._id.toString(),
              targetApplicationId: applicationSurvivor._id.toString(),
              createdAt: new Date(),
            },
          },
          upsert: true,
        },
      }));
      await db.collection('application_aliases').bulkWrite(aliasOperations, { session });
      await db.collection('application_aliases').updateMany(
        {
          userId,
          targetApplicationId: {
            $in: applicationLosers.map((application) => application._id.toString()),
          },
        },
        { $set: { targetApplicationId: applicationSurvivor._id.toString() } },
        { session },
      );
      await applications.deleteMany(
        { _id: { $in: applicationLosers.map((application) => application._id) }, userId },
        { session },
      );
      mergedApplicationGroups = 1;
    }

    await applications.updateOne(
      { _id: applicationSurvivor._id, userId },
      { $set: mergedApplication },
      { session },
    );
  }

  const mergedJob = mergeJobPostingDocuments(ranked);
  await jobPostings.updateOne(
    { _id: survivor._id, userId },
    { $set: mergedJob },
    { session },
  );

  const aliasOperations = losers.flatMap((job) => {
    const base = {
      userId,
      targetJobPostingId: survivorId,
      createdAt: new Date(),
    };
    const operations: Array<{
      updateOne: { filter: Document; update: Document; upsert: boolean };
    }> = [{
      updateOne: {
        filter: { userId, legacyJobPostingId: job._id.toString() },
        update: { $set: { ...base, legacyJobPostingId: job._id.toString() } },
        upsert: true,
      },
    }];
    if (typeof job.url_hash === 'string') {
      operations.push({
        updateOne: {
          filter: { userId, legacyKey: job.url_hash },
          update: { $set: { ...base, legacyKey: job.url_hash } },
          upsert: true,
        },
      });
    }
    return operations;
  });
  if (aliasOperations.length > 0) {
    await db.collection('job_posting_aliases').bulkWrite(aliasOperations, { session });
  }
  await db.collection('job_posting_aliases').updateMany(
    {
      userId,
      targetJobPostingId: { $in: losers.map((job) => job._id.toString()) },
    },
    { $set: { targetJobPostingId: survivorId } },
    { session },
  );

  await db.collection('migration_dedup_log').updateOne(
    { migrationKey: MIGRATION_KEY, survivorJobPostingId: survivorId },
    {
      $setOnInsert: {
        migrationKey: MIGRATION_KEY,
        userId,
        dedupKey,
        survivorJobPostingId: survivorId,
        mergedJobPostingIds: losers.map((job) => job._id.toString()),
        mergedApplicationIds: relatedApplications
          .filter((application) => application._id.toString() !== survivingApplicationId)
          .map((application) => application._id.toString()),
        createdAt: new Date(),
      },
    },
    { upsert: true, session },
  );

  await db.collection('cv_analyses').deleteMany(
    { userId, jobPostingId: { $in: allIds } },
    { session },
  );
  await jobPostings.deleteMany(
    { _id: { $in: losers.map((job) => job._id) }, userId },
    { session },
  );
  return { mergedApplicationGroups, statusFallbacks };
}

export function mergeJobPostingDocuments(documents: JobPostingMigrationDoc[]) {
  const ranked = [...documents].sort(compareJobPostings);
  const first = ranked[0];
  const createdAt = minDate(ranked.map((document) => document.created_at));
  const updatedAt = maxDate(ranked.map((document) => document.updated_at));
  const scrapedAt = maxDate(ranked.map((document) => document.scraped_at));
  const succeeded = ranked.some((document) => document.scrape_status === 'succeeded');
  const locationDocument = ranked.find(
    (document) => hasManualField(document, 'location') && hasValue(document.location),
  ) ?? ranked.find(
    (document) => document.location_normalization_status === 'matched' && hasValue(document.location),
  );
  const descriptionDocument = orderByManualField(ranked, 'description')
    .find((document) => hasValue(document.description));
  const bestUrlDocument = ranked.find((document) => {
    try {
      return identityForMigration(document).kind === 'native';
    } catch {
      return false;
    }
  }) ?? first;

  return {
    url: bestUrlDocument.url,
    source: pickValue(ranked, 'source'),
    source_key: pickValue(ranked, 'source_key'),
    source_label: pickValue(ranked, 'source_label'),
    native_job_id: pickValue(ranked, 'native_job_id'),
    title: pickJobPostingValue(ranked, 'title'),
    company: pickJobPostingValue(ranked, 'company'),
    location: locationDocument?.location ?? pickJobPostingValue(ranked, 'location'),
    location_details: locationDocument?.location_details ?? pickJobPostingValue(ranked, 'location_details'),
    location_normalization_status:
      locationDocument?.location_normalization_status
      ?? pickJobPostingValue(ranked, 'location_normalization_status'),
    location_normalized_at:
      locationDocument?.location_normalized_at ?? pickJobPostingValue(ranked, 'location_normalized_at'),
    description: descriptionDocument?.description,
    description_source: descriptionDocument?.description_source ?? pickValue(ranked, 'description_source'),
    contract_type: pickJobPostingValue(ranked, 'contract_type'),
    remote: pickJobPostingValue(ranked, 'remote'),
    salary: pickJobPostingValue(ranked, 'salary'),
    requirements: mergeStringArrays(orderByManualField(ranked, 'requirements'), 'requirements'),
    keywords: mergeStringArrays(orderByManualField(ranked, 'keywords'), 'keywords'),
    company_website: pickJobPostingValue(ranked, 'company_website'),
    manual_fields: mergeStringArrays(ranked, 'manual_fields'),
    manually_repaired_at: maxDate(ranked.map((document) => document.manually_repaired_at)),
    scrape_method: pickValue(ranked, 'scrape_method'),
    scrape_status: succeeded ? 'succeeded' : first.scrape_status,
    scrape_steps: succeeded ? [] : first.scrape_steps,
    scrape_attempts: Math.max(...ranked.map((document) => numericValue(document.scrape_attempts))),
    scrape_error: succeeded ? null : first.scrape_error,
    scrape_error_code: succeeded ? null : first.scrape_error_code,
    scrape_error_category: succeeded ? null : first.scrape_error_category,
    scrape_message_id: succeeded ? null : first.scrape_message_id,
    scrape_finished_at: succeeded ? maxDate(ranked.map((document) => document.scrape_finished_at)) : first.scrape_finished_at,
    created_at: createdAt,
    updated_at: updatedAt,
    scraped_at: scrapedAt,
  };
}

export function mergeApplicationDocuments(
  documents: ApplicationMigrationDoc[],
  targetJobPostingId: string,
) {
  const ranked = [...documents].sort(compareApplications);
  const first = ranked[0];
  const events = mergeEvents(ranked);
  const derivedStatus = deriveStatusFromEvents(events);
  return {
    jobPostingId: targetJobPostingId,
    status: applicationStatusFallbackRequired(ranked) ? first.status : derivedStatus,
    events,
    appliedAt: minDate(ranked.map((document) => document.appliedAt).filter(hasValue)),
    cvId: pickValue(ranked, 'cvId'),
    contact: mergeContacts(ranked),
    notes: mergeNotes(ranked),
    reminder: mergeReminder(ranked),
    created_at: minDate(ranked.map((document) => document.created_at)),
    updated_at: maxDate(ranked.map((document) => document.updated_at)),
  };
}

export function applicationStatusFallbackRequired(documents: ApplicationMigrationDoc[]) {
  const ranked = [...documents].sort(compareApplications);
  const currentStatus = ranked[0]?.status;
  if (!currentStatus) return false;
  return deriveStatusFromEvents(mergeEvents(ranked)) !== currentStatus;
}

function compareJobPostings(left: JobPostingMigrationDoc, right: JobPostingMigrationDoc) {
  const scoreDifference = scoreJobPosting(right) - scoreJobPosting(left);
  if (scoreDifference !== 0) return scoreDifference;
  const updatedDifference = dateValue(right.updated_at) - dateValue(left.updated_at);
  if (updatedDifference !== 0) return updatedDifference;
  return left._id.toHexString().localeCompare(right._id.toHexString());
}

function compareApplications(left: ApplicationMigrationDoc, right: ApplicationMigrationDoc) {
  const updatedDifference = dateValue(right.updated_at) - dateValue(left.updated_at);
  if (updatedDifference !== 0) return updatedDifference;
  return left._id.toHexString().localeCompare(right._id.toHexString());
}

function hasManualField(document: JobPostingMigrationDoc, key: string) {
  if (Array.isArray(document.manual_fields) && document.manual_fields.includes(key)) return true;
  if (document.scrape_method === 'manual') return true;
  return key === 'description' && document.description_source === 'manual';
}

function orderByManualField(documents: JobPostingMigrationDoc[], key: string) {
  return [...documents].sort(
    (left, right) => Number(hasManualField(right, key)) - Number(hasManualField(left, key)),
  );
}

function pickJobPostingValue(documents: JobPostingMigrationDoc[], key: string) {
  return pickValue(orderByManualField(documents, key), key);
}

function scoreJobPosting(document: JobPostingMigrationDoc) {
  const succeeded = document.scrape_status === 'succeeded';
  const manual = document.scrape_method === 'manual'
    || document.description_source === 'manual'
    || document.manually_repaired_at instanceof Date;
  const extension = document.scrape_method === 'extension';
  const active = document.scrape_status === 'processing';
  const queued = document.scrape_status === 'queued';
  const stateScore = manual && succeeded
    ? 700
    : extension && succeeded
      ? 600
      : succeeded
        ? 500
        : active
          ? 400
          : queued
            ? 300
            : 200;
  return stateScore + [
    document.title,
    document.company,
    document.location,
    document.description,
    document.contract_type,
    document.remote,
    document.salary,
    document.requirements,
    document.keywords,
    document.company_website,
  ].filter(hasValue).length;
}

function identityForMigration(job: JobPostingMigrationDoc) {
  if (typeof job.url !== 'string' || !job.url) throw new Error('missing url');
  if (
    job.source !== undefined
    && (typeof job.source !== 'string' || !(JOB_SOURCES as readonly string[]).includes(job.source))
  ) {
    throw new Error('invalid source');
  }
  if (job.source === 'custom' && typeof job.source_key !== 'string') {
    throw new Error('custom source is missing source_key');
  }
  if (job.native_job_id !== undefined && typeof job.native_job_id !== 'string') {
    throw new Error('invalid native_job_id');
  }
  return resolveJobPostingIdentity({
    url: job.url,
    source: job.source === 'manual' && /^https?:/i.test(job.url)
      ? undefined
      : job.source,
    sourceKey: typeof job.source_key === 'string' ? job.source_key : null,
    nativeJobId: typeof job.native_job_id === 'string' ? job.native_job_id : null,
    title: typeof job.title === 'string' ? job.title : null,
    company: typeof job.company === 'string' ? job.company : null,
    location: typeof job.location === 'string' ? job.location : null,
  });
}

function mergeEvents(documents: ApplicationMigrationDoc[]) {
  const events = documents.flatMap((document) => Array.isArray(document.events) ? document.events : []);
  const created = events
    .filter((event) => event.type === 'created')
    .sort((left, right) => dateValue(left.at) - dateValue(right.at))[0];
  const seen = new Set<string>();
  return events
    .filter((event) => event.type !== 'created')
    .concat(created ? [created] : [])
    .filter((event) => {
      const key = `${event.type}\0${new Date(event.at).toISOString()}\0${stableStringify(event.meta)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => dateValue(left.at) - dateValue(right.at));
}

function mergeContacts(documents: ApplicationMigrationDoc[]) {
  const contacts = documents
    .map((document) => document.contact)
    .filter((contact): contact is Document => Boolean(contact) && typeof contact === 'object');
  if (contacts.length === 0) return null;
  return {
    name: pickValue(contacts, 'name') ?? null,
    role: pickValue(contacts, 'role') ?? null,
    email: pickValue(contacts, 'email') ?? null,
    phone: pickValue(contacts, 'phone') ?? null,
  };
}

function mergeNotes(documents: ApplicationMigrationDoc[]) {
  const notes = [...documents]
    .sort((left, right) => dateValue(left.updated_at) - dateValue(right.updated_at))
    .map((document) => typeof document.notes === 'string' ? document.notes.trim() : '')
    .filter(Boolean);
  const unique = [...new Set(notes)];
  return unique.length > 0 ? unique.join('\n\n---\n\n') : null;
}

function mergeReminder(documents: ApplicationMigrationDoc[]) {
  const reminder = pickValue(documents, 'reminder');
  if (!reminder || typeof reminder !== 'object') return reminder ?? null;
  const sentCount = Math.max(
    ...documents.map((document) => {
      const value = document.reminder;
      return value && typeof value === 'object' ? numericValue(value.sentCount) : 0;
    }),
  );
  return { ...reminder, enabled: reminder.enabled !== false, sentCount };
}

interface ReminderCleanupDecision {
  ambiguous: boolean;
  missingEnabled: boolean;
  obsolete: boolean;
  terminal: boolean;
  updates: Record<string, unknown>;
}

export function getReminderCleanupDecision(
  application: Pick<ApplicationMigrationDoc, 'events' | 'reminder' | 'status'>,
): ReminderCleanupDecision {
  const updates: Record<string, unknown> = {};
  const missingEnabled = application.reminder?.enabled === undefined;
  if (missingEnabled) updates['reminder.enabled'] = true;

  const rawReminderAt = application.reminder?.at;
  const reminderAt = parseValidDate(rawReminderAt);
  const terminal = Boolean(application.status && TERMINAL_STATUSES.includes(application.status));
  if (terminal) {
    if (application.reminder?.at !== null) updates['reminder.at'] = null;
    if (application.reminder?.snoozedUntil !== null) updates['reminder.snoozedUntil'] = null;
    return {
      ambiguous: false,
      missingEnabled,
      obsolete: false,
      terminal: Object.keys(updates).some((key) => key !== 'reminder.enabled'),
      updates,
    };
  }

  if (!reminderAt) {
    return {
      ambiguous: rawReminderAt !== undefined && rawReminderAt !== null,
      missingEnabled,
      obsolete: false,
      terminal: false,
      updates,
    };
  }

  const relevantEvents = (application.events ?? [])
    .filter((event) => event.type === 'followup_sent' || event.type === 'response_received');
  const eventDates = relevantEvents
    .map((event) => parseValidDate(event.at))
    .filter((date): date is Date => Boolean(date));
  const ambiguous = relevantEvents.length !== eventDates.length;
  const latestEvent = eventDates.sort((left, right) => right.getTime() - left.getTime())[0];
  if (!latestEvent) {
    return { ambiguous, missingEnabled, obsolete: false, terminal: false, updates };
  }

  const frequencyDays = application.reminder?.frequencyDays;
  if (!Number.isFinite(frequencyDays) || !frequencyDays || frequencyDays <= 0) {
    return { ambiguous: true, missingEnabled, obsolete: false, terminal: false, updates };
  }

  const automaticWindowEnd = latestEvent.getTime() + frequencyDays * 24 * 60 * 60_000;
  const obsolete = reminderAt.getTime() <= automaticWindowEnd;
  if (obsolete) {
    updates['reminder.at'] = null;
    updates['reminder.snoozedUntil'] = null;
  }
  return { ambiguous, missingEnabled, obsolete, terminal: false, updates };
}

function parseValidDate(value: unknown) {
  if (!(value instanceof Date) && typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function addReminderDecisionToReport(
  report: ReminderCleanupReport,
  decision: ReminderCleanupDecision,
) {
  if (decision.ambiguous) report.ambiguous += 1;
  if (decision.missingEnabled) report.missingEnabled += 1;
  if (decision.obsolete) report.obsolete += 1;
  if (decision.terminal) report.terminal += 1;
  if (Object.keys(decision.updates).length > 0) report.updated += 1;
}

async function cleanupApplicationReminders(db: Db, ownerId: string, batchSize: number) {
  const report: ReminderCleanupReport = {
    ambiguous: 0,
    missingEnabled: 0,
    obsolete: 0,
    terminal: 0,
    updated: 0,
  };
  const applications = db.collection<ApplicationMigrationDoc>('applications');
  let cursorId: ObjectId | null = null;

  while (true) {
    const documents = await applications.find(
      cursorId ? { _id: { $gt: cursorId } } : {},
      { sort: { _id: 1 }, limit: batchSize },
    ).toArray();
    if (documents.length === 0) break;

    const operations = documents.flatMap((application) => {
      const decision = getReminderCleanupDecision(application);
      addReminderDecisionToReport(report, decision);
      if (Object.keys(decision.updates).length === 0) return [];
      return [{
        updateOne: {
          filter: { _id: application._id },
          update: { $set: decision.updates },
        },
      }];
    });
    if (operations.length > 0) await applications.bulkWrite(operations, { ordered: false });

    cursorId = documents.at(-1)?._id ?? cursorId;
    await renewLease(db, ownerId);
  }

  return report;
}

async function createFinalIndexes(db: Db) {
  await db.collection('job_postings').dropIndex('userId_1_dedup_key_1').catch(() => undefined);
  await db.collection('job_postings').createIndex(
    { userId: 1, dedup_key: 1 },
    { unique: true, name: 'userId_1_dedup_key_1' },
  );
  await db.collection('applications').createIndex(
    { userId: 1, jobPostingId: 1 },
    { unique: true, name: 'userId_1_jobPostingId_1' },
  );
  await db.collection('cv_analyses').createIndex(
    { userId: 1, cvHash: 1, jobPostingId: 1 },
    { unique: true, name: 'userId_1_cvHash_1_jobPostingId_1' },
  );
  await db.collection('application_aliases').createIndex(
    { userId: 1, legacyApplicationId: 1 },
    { unique: true },
  );
  await db.collection('job_posting_aliases').createIndex(
    { userId: 1, legacyJobPostingId: 1 },
    { unique: true, partialFilterExpression: { legacyJobPostingId: { $type: 'string' } } },
  );
  await db.collection('job_posting_aliases').createIndex(
    { userId: 1, legacyKey: 1 },
    { unique: true, partialFilterExpression: { legacyKey: { $type: 'string' } } },
  );
  await db.collection('migration_dedup_log').createIndex(
    { migrationKey: 1, survivorJobPostingId: 1 },
    { unique: true },
  );
}

async function deleteOrphanAnalyses(db: Db, ownerId: string) {
  while (true) {
    const orphanIds = await db.collection('cv_analyses').aggregate<{ _id: ObjectId }>([
      {
        $lookup: {
          from: 'job_postings',
          let: { jobPostingId: '$jobPostingId', userId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: '$_id' }, '$$jobPostingId'] },
                    { $eq: ['$userId', '$$userId'] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'jobPosting',
        },
      },
      { $match: { jobPosting: { $size: 0 } } },
      { $project: { _id: 1 } },
      { $limit: 250 },
    ]).toArray();
    if (orphanIds.length === 0) return;
    await db.collection('cv_analyses').deleteMany({
      _id: { $in: orphanIds.map((analysis) => analysis._id) },
    });
    await renewLease(db, ownerId);
  }
}

export async function verifyDedupKeyV2Invariants(db: Db) {
  const missingDedup = await db.collection('job_postings').countDocuments({
    $or: [
      { dedup_key: { $not: { $type: 'string' } } },
      { dedup_version: { $ne: 2 } },
    ],
  });
  const jobPostingCollisions = await countCollisionGroups(
    db,
    'job_postings',
    { userId: '$userId', dedupKey: '$dedup_key' },
  );
  const applicationCollisions = await countCollisionGroups(
    db,
    'applications',
    { userId: '$userId', jobPostingId: '$jobPostingId' },
  );
  const orphanApplications = await countOrphans(db, 'applications', 'job_postings');
  const orphanAnalyses = await countOrphans(db, 'cv_analyses', 'job_postings');
  const orphanApplicationAliases = await countAliasOrphans(
    db,
    'application_aliases',
    'applications',
    'targetApplicationId',
  );
  const orphanJobPostingAliases = await countAliasOrphans(
    db,
    'job_posting_aliases',
    'job_postings',
    'targetJobPostingId',
  );
  return {
    applicationCollisions,
    jobPostingCollisions,
    missingDedup,
    orphanApplicationAliases,
    orphanAnalyses,
    orphanApplications,
    orphanJobPostingAliases,
  };
}

async function countCollisionGroups(db: Db, collection: string, groupId: Document) {
  const result = await db.collection(collection).aggregate<{ count: number }>([
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'count' },
  ]).next();
  return result?.count ?? 0;
}

async function countOrphans(db: Db, sourceCollection: string, targetCollection: string) {
  const result = await db.collection(sourceCollection).aggregate<{ count: number }>([
    {
      $lookup: {
        from: targetCollection,
        let: { jobPostingId: '$jobPostingId', userId: '$userId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: [{ $toString: '$_id' }, '$$jobPostingId'] },
                  { $eq: ['$userId', '$$userId'] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'jobPosting',
      },
    },
    { $match: { jobPosting: { $size: 0 } } },
    { $count: 'count' },
  ]).next();
  return result?.count ?? 0;
}

async function countAliasOrphans(
  db: Db,
  sourceCollection: string,
  targetCollection: string,
  targetField: string,
) {
  const result = await db.collection(sourceCollection).aggregate<{ count: number }>([
    {
      $lookup: {
        from: targetCollection,
        let: { targetId: `$${targetField}`, userId: '$userId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: [{ $toString: '$_id' }, '$$targetId'] },
                  { $eq: ['$userId', '$$userId'] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'target',
      },
    },
    { $match: { target: { $size: 0 } } },
    { $count: 'count' },
  ]).next();
  return result?.count ?? 0;
}

function pickValue(documents: Document[], key: string) {
  return documents.find((document) => hasValue(document[key]))?.[key];
}

function mergeStringArrays(documents: Document[], key: string) {
  const values = documents.flatMap((document) => Array.isArray(document[key]) ? document[key] : []);
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLocaleLowerCase('fr');
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function minDate(values: unknown[]) {
  const dates = values.map(toDate).filter((value): value is Date => value !== null);
  return dates.length > 0 ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null;
}

function maxDate(values: unknown[]) {
  const dates = values.map(toDate).filter((value): value is Date => value !== null);
  return dates.length > 0 ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
}

function toDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function dateValue(value: unknown) {
  return toDate(value)?.getTime() ?? 0;
}

function numericValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}
