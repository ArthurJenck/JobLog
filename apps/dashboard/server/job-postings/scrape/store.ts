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
  url_hash: string;
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
}: {
  cached: JobPostingDoc | null;
  userId: string;
  url: string;
  url_hash: string;
}) {
  const jobPostings = await getCollection<JobPostingDoc>('job_postings');
  const now = new Date();
  const attempt = normalizeCount(cached?.scrape_attempts) + 1;
  const placeholder = buildPlaceholderJobPosting(userId, url, url_hash, attempt, now);

  if (cached?._id) {
    await jobPostings.updateOne(
      { _id: cached._id, userId },
      {
        $set: {
          scrape_status: 'queued',
          scrape_steps: placeholder.scrape_steps,
          scrape_attempts: attempt,
          scrape_error: null,
          scrape_error_code: null,
          scrape_error_category: null,
          scrape_message_id: null,
          scrape_started_at: null,
          scrape_finished_at: null,
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
    );

    return { jobPostingId: cached._id.toString(), attempt };
  }

  const result = await jobPostings.findOneAndUpdate(
    { userId, url_hash },
    { $setOnInsert: placeholder },
    { upsert: true, returnDocument: 'after' },
  );

  if (!result?._id) {
    const existing = await jobPostings.findOne({ userId, url_hash });
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
  attempt: number,
  now: Date,
): JobPostingDoc {
  const domain = getDisplayDomain(url);

  return {
    userId,
    url,
    url_hash,
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

export async function copyJobPostingForUser(donor: JobPostingDoc, userId: string): Promise<string> {
  const jobPostings = await getCollection<JobPostingDoc>('job_postings');
  const now = new Date();
  const copy: JobPostingDoc = {
    ...donor,
    userId,
    scrape_status: 'succeeded',
    created_at: now,
    updated_at: now,
  };
  delete copy._id;
  const result = await jobPostings.insertOne(copy);
  return result.insertedId.toString();
}

export async function createOrGetApplication(userId: string, jobPostingId: string) {
  const col = await getCollection<ApplicationDoc>('applications');
  const existing = await col.findOne({ userId, jobPostingId });
  if (existing?._id) return existing._id.toString();

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
      at: null,
      frequencyDays: 7,
      maxCount: 3,
      sentCount: 0,
      snoozedUntil: null,
    },
    created_at: now,
    updated_at: now,
  };

  const result = await col.insertOne(doc);
  return result.insertedId.toString();
}

export async function updateScrapeSteps(jobPostingId: ObjectId, attempt: number, steps: ScrapeStep[]) {
  await (await getCollection<JobPostingDoc>('job_postings')).updateOne(
    { _id: jobPostingId, scrape_attempts: attempt },
    { $set: { scrape_steps: steps, updated_at: new Date() } },
  );
}

export async function markScrapeFailed({
  jobPostingId,
  attempt,
  userId,
  message,
  code,
  steps,
  releaseUsage,
}: {
  jobPostingId: string;
  attempt: number;
  userId: string;
  message: string;
  code: string;
  steps?: ScrapeStep[];
  releaseUsage: boolean;
}) {
  if (!ObjectId.isValid(jobPostingId)) return;

  const now = new Date();
  const failedSteps = markCurrentStepFailed(steps ?? buildInitialSteps(now), message);

  const result = await (await getCollection<JobPostingDoc>('job_postings')).updateOne(
    { _id: new ObjectId(jobPostingId), scrape_attempts: attempt },
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

  console.warn('[url-scrape] failed', { jobPostingId, attempt, code, message });
}
