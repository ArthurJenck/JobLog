import {
  CONTRACT_TYPES,
  JOB_SOURCES,
  REMOTE_TYPES,
  type JobSource,
} from '@joblog/shared';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { normalizeLocationForStorage } from '../../lib/addresses.js';
import { getCollection, getDb, withMongoTransaction } from '../../lib/db.js';
import { sha256 } from '../../lib/hash.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';
import { getReminderDefaultDays } from '../../lib/notification-settings.js';
import { loadApplicationWithJob } from '../applications/with-job.js';
import { createManualJobUrl, identifyJobPosting } from '../job-postings/url-identity.js';

const HandoffSalarySchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  currency: z.string().nullable(),
  period: z.enum(['month', 'year']).nullable(),
});

const ManualHandoffBodySchema = z.object({
  url: z.string().url().optional(),
  title: z.string().trim().min(1).max(500),
  company: z.string().trim().min(1).max(500),
  location: z.string().trim().max(500).nullable().optional(),
  description: z.string().max(20_000).nullable().optional(),
  contract_type: z.enum(CONTRACT_TYPES).nullable().optional(),
  remote: z.enum(REMOTE_TYPES).nullable().optional(),
  salary: HandoffSalarySchema.nullable().optional(),
  requirements: z.array(z.string().max(500)).max(50).nullable().optional(),
  keywords: z.array(z.string().max(200)).max(50).nullable().optional(),
  company_website: z.string().max(500).nullable().optional(),
  cvId: z.string().nullable().optional(),
}).strict();

async function resolveDefaultCvId(userId: string) {
  const cvs = await (await getCollection('cvs'))
    .find({ userId }, { projection: { _id: 1, isDefault: 1 } })
    .toArray();
  const selected = cvs.find((cv) => cv.isDefault) ?? (cvs.length === 1 ? cvs[0] : null);
  return selected?._id.toString() ?? null;
}

export default defineHandler({
  GET: method({
    rateLimit: { max: 60, windowMs: 60_000, scope: ({ user }) => `manual-handoff-read:${user!.id}` },
    async handle({ user, query }) {
      const { token } = query as { token: string };
      const handoff = await (await getCollection('manual_handoffs')).findOne({
        userId: user.id,
        tokenHash: sha256(token),
        consumedAt: null,
        expiresAt: { $gt: new Date() },
      });
      if (!handoff) throw ApiError.notFound('Brouillon introuvable ou expiré');
      return { json: { draft: handoff.draft, expiresAt: handoff.expiresAt } };
    },
  }),
  POST: method({
    maintenanceSensitive: true,
    body: ManualHandoffBodySchema,
    rateLimit: { max: 20, windowMs: 60_000, scope: ({ user }) => `manual-handoff-consume:${user!.id}` },
    async handle({ user, query, body }) {
      const { token } = query as { token: string };
      const tokenHash = sha256(token);
      const defaultCvId = body.cvId ?? await resolveDefaultCvId(user.id);
      const locationNormalization = await normalizeLocationForStorage(body.location ?? null);
      const frequencyDays = await getReminderDefaultDays(user.id);
      const now = new Date();

      const outcome = await withMongoTransaction(async (session) => {
        const db = await getDb();
        const handoffs = db.collection('manual_handoffs');
        const handoff = await handoffs.findOne({
          userId: user.id,
          tokenHash,
          consumedAt: null,
          expiresAt: { $gt: now },
        }, { session });
        if (!handoff) throw ApiError.notFound('Brouillon introuvable ou expiré');

        const draft = handoff.draft && typeof handoff.draft === 'object'
          ? handoff.draft as Record<string, unknown>
          : {};
        const url = body.url ?? (typeof draft.url === 'string' ? draft.url : createManualJobUrl());
        const rawSource = typeof draft.source === 'string' ? draft.source : 'manual';
        const source = (JOB_SOURCES as readonly string[]).includes(rawSource)
          ? rawSource as JobSource
          : 'manual';
        const sourceKey = typeof draft.source_key === 'string' ? draft.source_key : source;
        const nativeJobId = typeof draft.native_job_id === 'string'
          ? draft.native_job_id
          : null;
        const identity = identifyJobPosting({
          url,
          source,
          sourceKey,
          nativeJobId,
          title: body.title,
          company: body.company,
          location: body.location,
        });

        const jobPostings = db.collection('job_postings');
        const existingJob = await jobPostings.findOne({
          userId: user.id,
          dedup_key: identity.dedupKey,
        }, { session });
        const jobPostingId = existingJob?._id ?? new ObjectId();
        const providedBodyFields = new Set(
          Object.keys(body).filter((key) => key !== 'cvId'),
        );
        const existingManualFields = Array.isArray(existingJob?.manual_fields)
          ? existingJob.manual_fields.filter((field): field is string => typeof field === 'string')
          : [];
        const manualFields = [...new Set([
          ...existingManualFields,
          ...providedBodyFields,
        ])];
        const draftSalary = HandoffSalarySchema.safeParse(draft.salary);
        const draftRequirements = Array.isArray(draft.requirements)
          ? draft.requirements.filter((value): value is string => typeof value === 'string').slice(0, 50)
          : null;
        const draftKeywords = Array.isArray(draft.keywords)
          ? draft.keywords.filter((value): value is string => typeof value === 'string').slice(0, 50)
          : null;
        const jobValues: Record<string, unknown> = {
          url: identity.canonicalUrl,
          dedup_key: identity.dedupKey,
          dedup_version: 2,
          source: identity.source,
          source_key: identity.sourceKey,
          native_job_id: identity.nativeJobId,
          source_label: typeof draft.source_label === 'string' ? draft.source_label : null,
          title: body.title,
          company: body.company,
          ...locationNormalization,
          description: body.description ?? null,
          description_source: 'manual',
          contract_type: body.contract_type ?? null,
          remote: body.remote ?? null,
          salary: body.salary !== undefined
            ? body.salary
            : draftSalary.success ? draftSalary.data : null,
          requirements: body.requirements !== undefined ? body.requirements : draftRequirements,
          keywords: body.keywords !== undefined ? body.keywords : draftKeywords,
          company_website: body.company_website ?? null,
          scrape_method: 'manual',
          scraped_at: now,
          scrape_status: 'succeeded',
          scrape_steps: [],
          scrape_error: null,
          scrape_error_code: null,
          scrape_error_category: null,
          scrape_message_id: null,
          scrape_started_at: null,
          scrape_finished_at: now,
          manually_repaired_at: now,
          manual_fields: manualFields,
          updated_at: now,
        };
        for (const field of existingManualFields) {
          if (providedBodyFields.has(field)) continue;
          delete jobValues[field];
          if (field === 'description') delete jobValues.description_source;
          if (field === 'location') {
            delete jobValues.location_details;
            delete jobValues.location_normalization_status;
            delete jobValues.location_normalized_at;
          }
        }

        if (existingJob) {
          await jobPostings.updateOne(
            { _id: jobPostingId, userId: user.id },
            { $set: jobValues, $inc: { scrape_attempts: 1 } },
            { session },
          );
        } else {
          await jobPostings.insertOne({
            _id: jobPostingId,
            userId: user.id,
            ...jobValues,
            scrape_attempts: 0,
            created_at: now,
          }, { session });
        }

        const applications = db.collection('applications');
        const existingApplication = await applications.findOne({
          userId: user.id,
          jobPostingId: jobPostingId.toString(),
        }, { session });
        const applicationId = existingApplication?._id ?? new ObjectId();
        if (existingApplication) {
          await applications.updateOne(
            { _id: applicationId, userId: user.id },
            { $set: { updated_at: now } },
            { session },
          );
        } else {
          await applications.insertOne({
            _id: applicationId,
            userId: user.id,
            jobPostingId: jobPostingId.toString(),
            cvId: defaultCvId,
            status: 'saved',
            appliedAt: null,
            contact: null,
            notes: null,
            events: [{ type: 'created', at: now, meta: null }],
            reminder: {
              enabled: true,
              at: null,
              frequencyDays,
              maxCount: 3,
              sentCount: 0,
              snoozedUntil: null,
            },
            created_at: now,
            updated_at: now,
          }, { session });
        }

        const consumed = await handoffs.updateOne(
          { _id: handoff._id, consumedAt: null },
          {
            $set: {
              consumedAt: now,
              targetJobPostingId: jobPostingId.toString(),
              targetApplicationId: applicationId.toString(),
            },
          },
          { session },
        );
        if (consumed.modifiedCount !== 1) throw ApiError.conflict('Brouillon déjà consommé');

        return { applicationId, duplicate: Boolean(existingApplication) };
      });

      const application = await loadApplicationWithJob(user.id, outcome.applicationId);
      return { status: outcome.duplicate ? 200 : 201, json: application };
    },
  }),
});
