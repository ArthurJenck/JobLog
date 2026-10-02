import { ObjectId } from 'mongodb';
import {
  type ContractType,
  type EventType,
  type JobSource,
  type LocationNormalizationStatus,
  type RemoteType,
  type ScrapeMethod,
  type ScrapeStatus,
} from '@joblog/shared';
import { getCollection } from '../../../lib/db.js';
import { normalizeCount, releaseUrlUsage } from '../../usage/url-usage.js';
import { type ScrapeErrorCategory, classifyErrorCategory } from './errors.js';
import { detectSource, getDisplayDomain, type NormalizedExtraction } from './normalize.js';
import {
  type ScrapeStep,
  buildInitialSteps,
  isBlockedLegacyJobPosting,
  markCurrentStepFailed,
} from './steps.js';

export interface JobPostingDoc {
  _id?: ObjectId;
  userId?: string;
  url: string;
  url_hash?: string;
  dedup_key?: string;
  dedup_version?: 2;
  source_key?: string;
  source_label?: string;
  native_job_id?: string;
  source?: JobSource;
  title?: unknown;
  company?: unknown;
  location?: string | null;
  location_details?: unknown;
  location_normalization_status?: LocationNormalizationStatus | null;
  location_normalized_at?: Date | null;
  description?: unknown;
  description_source?: 'scrape' | 'manual';
  contract_type?: ContractType | null;
  remote?: RemoteType | null;
  salary?: NormalizedExtraction['salary'];
  requirements?: string[] | null;
  keywords?: string[] | null;
  company_website?: string | null;
  scrape_method?: ScrapeMethod;
  scraped_at?: Date;
  scrape_status?: ScrapeStatus | null;
  scrape_steps?: ScrapeStep[];
  scrape_attempts?: number;
  scrape_error?: string | null;
  scrape_error_code?: string | null;
  scrape_error_category?: ScrapeErrorCategory | null;
  scrape_message_id?: string | null;
  scrape_started_at?: Date | null;
  scrape_finished_at?: Date | null;
  manually_repaired_at?: Date | null;
  manual_fields?: string[];
  created_at?: Date;
  updated_at?: Date;
}

export interface ApplicationDoc {
  _id?: ObjectId;
  userId: string;
  jobPostingId: string;
  status: string;
  appliedAt: Date | null;
  contact: null;
  notes: null;
  events: Array<{ type: EventType; at: Date; meta: unknown }>;
  reminder: {
    enabled: boolean;
    at: Date | null;
    frequencyDays: number;
    maxCount: number;
    sentCount: number;
    snoozedUntil: Date | null;
  };
  created_at: Date;
  updated_at: Date;
}

export async function createOrResetQueuedJobPosting({
  cached,
  userId,
  url,
  url_hash,
  dedup_key,
  source_key,
  native_job_id,
}: {
  cached: JobPostingDoc | null;
  userId: string;
  url: string;
  url_hash: string;
  dedup_key: string;
  source_key: string;
  native_job_id?: string | null;
}) {
  const jobPostings = await getCollection<JobPostingDoc>('job_postings');
  const now = new Date();
  const attempt = normalizeCount(cached?.scrape_attempts) + 1;
  const placeholder = buildPlaceholderJobPosting(
    userId,
    url,
    url_hash,
    dedup_key,
    source_key,
    native_job_id,
    attempt,
    now,
  );

  if (cached?._id) {
    const attemptFilter = cached.scrape_attempts === undefined
      ? { $or: [{ scrape_attempts: { $exists: false } }, { scrape_attempts: 0 }] }
      : { scrape_attempts: cached.scrape_attempts };
    const result = await jobPostings.findOneAndUpdate(
      {
        _id: cached._id,
        userId,
        scrape_status: cached.scrape_status,
        ...attemptFilter,
      },
      {
        $set: {
          url,
          url_hash,
          dedup_key,
          dedup_version: 2,
          source_key,
          ...(native_job_id ? { native_job_id } : {}),
          scrape_status: 'queued',
          scrape_steps: placeholder.scrape_steps,
          scrape_attempts: attempt,
          scrape_error: null,
          scrape_error_code: null,
          scrape_error_category: null,
          scrape_message_id: null,
          scrape_started_at: null,
          scrape_finished_at: null,
          manually_repaired_at: null,
          updated_at: now,
          ...(isBlockedLegacyJobPosting(cached)
            ? {
                title: placeholder.title,
                company: placeholder.company,
                description: placeholder.description,
                source: placeholder.source,
              }
            : {}),
        },
      },
      { returnDocument: 'after' },
    );

    if (result?._id) {
      return { jobPostingId: result._id.toString(), attempt: normalizeCount(result.scrape_attempts) };
    }

    const current = await jobPostings.findOne({ _id: cached._id, userId });
    if (!current?._id) throw new Error('Unable to reset queued job posting');
    const currentAttempt = normalizeCount(current.scrape_attempts);
    if (currentAttempt < 1) throw new Error('Unable to claim queued job posting');
    return {
      jobPostingId: current._id.toString(),
      attempt: currentAttempt,
    };
  }

  const result = await jobPostings.findOneAndUpdate(
    { userId, dedup_key },
    { $setOnInsert: placeholder },
    { upsert: true, returnDocument: 'after' },
  );

  if (!result?._id) {
    const existing = await jobPostings.findOne({ userId, dedup_key });
    if (!existing?._id) throw new Error('Unable to create queued job posting');
    return {
      jobPostingId: existing._id.toString(),
      attempt: normalizeCount(existing.scrape_attempts) || 1,
    };
  }

  return { jobPostingId: result._id.toString(), attempt };
}

export function buildPlaceholderJobPosting(
  userId: string,
  url: string,
  url_hash: string,
  dedup_key: string,
  source_key: string,
  native_job_id: string | null | undefined,
  attempt: number,
  now: Date,
): JobPostingDoc {
  const domain = getDisplayDomain(url);

  return {
    userId,
    url,
    url_hash,
    dedup_key,
    dedup_version: 2,
    source_key,
    ...(native_job_id ? { native_job_id } : {}),
    source: detectSource(url),
    title: "Offre en cours de récupération",
    company: domain,
    location: null,
    location_details: null,
    location_normalization_status: 'skipped',
    location_normalized_at: null,
    description: null,
    contract_type: null,
    remote: null,
    salary: null,
    requirements: null,
    keywords: null,
    company_website: null,
    scrape_method: 'jina',
    scraped_at: now,
    scrape_status: 'queued',
    scrape_steps: buildInitialSteps(now),
    scrape_attempts: attempt,
    scrape_error: null,
    scrape_error_code: null,
    scrape_error_category: null,
    scrape_message_id: null,
    scrape_started_at: null,
    scrape_finished_at: null,
    created_at: now,
    updated_at: now,
  };
}

export async function createOrGetApplication(userId: string, jobPostingId: string) {
  const col = await getCollection<ApplicationDoc>('applications');
  const now = new Date();
  const doc: ApplicationDoc = {
    userId,
    jobPostingId,
    status: 'saved',
    appliedAt: null,
    contact: null,
    notes: null,
    events: [{ type: 'created', at: now, meta: null }],
    reminder: {
      enabled: true,
      at: null,
      frequencyDays: 7,
      maxCount: 3,
      sentCount: 0,
      snoozedUntil: null,
    },
    created_at: now,
    updated_at: now,
  };

  const result = await col.findOneAndUpdate(
    { userId, jobPostingId },
    { $setOnInsert: doc },
    { upsert: true, returnDocument: 'after' },
  );
  if (!result?._id) throw new Error('Unable to create application');
  return result._id.toString();
}

export interface ScrapeWriteGuard {
  jobPostingId: ObjectId;
  userId: string;
  dedupKey: string;
  attempt: number;
}

export async function updateScrapeSteps(guard: ScrapeWriteGuard, steps: ScrapeStep[]) {
  const result = await (await getCollection<JobPostingDoc>('job_postings')).updateOne(
    buildScrapeWriteFilter(guard),
    { $set: { scrape_steps: steps, updated_at: new Date() } },
  );
  return result.matchedCount > 0;
}

export async function markScrapeFailed({
  jobPostingId,
  attempt,
  userId,
  dedupKey,
  message,
  code,
  steps,
  releaseUsage,
}: {
  jobPostingId: string;
  attempt: number;
  userId: string;
  dedupKey: string;
  message: string;
  code: string;
  steps?: ScrapeStep[];
  releaseUsage: boolean;
}) {
  if (!ObjectId.isValid(jobPostingId)) return;

  const now = new Date();
  const failedSteps = markCurrentStepFailed(steps ?? buildInitialSteps(now), message);

  const result = await (await getCollection<JobPostingDoc>('job_postings')).updateOne(
    buildScrapeWriteFilter({
      jobPostingId: new ObjectId(jobPostingId),
      userId,
      dedupKey,
      attempt,
    }),
    {
      $set: {
        scrape_status: 'failed',
        scrape_steps: failedSteps,
        scrape_error: message,
        scrape_error_code: code,
        scrape_error_category: classifyErrorCategory(code),
        scrape_finished_at: now,
        updated_at: now,
      },
      $unset: { scrape_message_id: '' },
    },
  );

  if (releaseUsage && result.matchedCount > 0) {
    await releaseUrlUsage(userId);
  }

  if (result.matchedCount > 0) {
    console.warn('[url-scrape] failed', { jobPostingId, attempt, code, message });
  }
}

export function isActiveScrapeStale(jobPosting: JobPostingDoc, now = new Date()) {
  if (jobPosting.scrape_status !== 'queued' && jobPosting.scrape_status !== 'processing') {
    return false;
  }
  const lastActivity = jobPosting.updated_at ?? jobPosting.scrape_started_at ?? jobPosting.created_at;
  if (!lastActivity) return true;
  return now.getTime() - lastActivity.getTime() >= 15 * 60 * 1000;
}

export function buildScrapeWriteFilter(guard: ScrapeWriteGuard) {
  return {
    _id: guard.jobPostingId,
    userId: guard.userId,
    dedup_key: guard.dedupKey,
    scrape_attempts: guard.attempt,
    scrape_status: { $ne: 'succeeded' as const },
    manually_repaired_at: null,
  };
}
