import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { QueueClient, registerDevConsumer, DuplicateMessageError } from '@vercel/queue';
import { getCollection } from '../../lib/db.js';
import { getEnv } from '../../lib/env.js';
import { sha256 } from '../../lib/hash.js';
import { normalizeLocationForStorage } from '../../lib/addresses.js';
import {
  CONTRACT_TYPES,
  GEMINI_DAILY_QUOTA,
  GEMINI_MODEL,
  GEMINI_SCRAPE_RESERVE,
  REMOTE_TYPES,
  SCRAPE_STEP_KEYS,
  type ContractType,
  type EventType,
  type JobSource,
  type LocationNormalizationStatus,
  type RemoteType,
  type ScrapeMethod,
  type ScrapeStatus,
  parseContractType,
  parseRemote,
} from '@joblog/shared';

export const URL_SCRAPE_TOPIC = 'joblog-url-scrape';

const queue = new QueueClient();
let didRegisterDevConsumer = false;

const URL_USAGE_KIND = 'url_paste';
const URL_USAGE_WARNING_AT = 12;
const URL_USAGE_LIMIT = 15;
const JINA_ALERT_THRESHOLD_DEFAULT = 8_000_000;
const JINA_READER_URL = 'https://r.jina.ai/';
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2/scrape';
const FIRECRAWL_MONTHLY_SOFT_CAP = 900;
const MAX_MARKDOWN_CHARS_FOR_GEMINI = 18_000;
const MAX_DESCRIPTION_CHARS = 10_000;
const PARIS_TIME_ZONE = 'Europe/Paris';

const STEP_LABELS: Record<(typeof SCRAPE_STEP_KEYS)[number], string> = {
  created: 'Candidature créée',
  fetch: 'Lecture de la page',
  extract: 'Extraction des informations',
  normalize: 'Normalisation',
  complete: 'Offre prête',
};

const RequestSchema = z.object({ url: z.string().url() });

const RetrySchema = z.object({ applicationId: z.string() });

export const UrlScrapeJobMessageSchema = z.object({
  jobPostingId: z.string(),
  userId: z.string(),
  url: z.string().url(),
  url_hash: z.string(),
  attempt: z.number().int().positive(),
});

const SalarySchema = z.object({
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  period: z.enum(['month', 'year']).nullable().optional(),
}).nullable().optional();

const GeminiExtractionSchema = z.object({
  readable: z.boolean().nullable().optional(),
  failure_reason: z.enum(['blocked', 'login_required', 'not_job_posting', 'empty', 'other']).nullable().optional(),
  title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  contract_type: z.string().nullable().optional(),
  remote: z.string().nullable().optional(),
  salary: SalarySchema,
  requirements: z.array(z.string()).nullable().optional(),
  keywords: z.array(z.string()).nullable().optional(),
  company_website: z.string().nullable().optional(),
});

export type UrlScrapeJobMessage = z.infer<typeof UrlScrapeJobMessageSchema>;

export type UrlUsage = {
  date: string;
  count: number;
  warningAt: number;
  limit: number;
  remaining: number;
  shouldWarn: boolean;
  isBlocked: boolean;
};

type ScrapeStep = {
  key: (typeof SCRAPE_STEP_KEYS)[number];
  label: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  at: Date | null;
  message?: string | null;
};

type NormalizedExtraction = {
  title: string;
  company: string;
  location: string | null;
  description: string | null;
  contract_type: ContractType | null;
  remote: RemoteType | null;
  salary: {
    min: number | null;
    max: number | null;
    currency: string | null;
    period: 'month' | 'year' | null;
  } | null;
  requirements: string[] | null;
  keywords: string[] | null;
  company_website: string | null;
};

interface JobPostingDoc {
  _id?: ObjectId;
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

interface ApplicationDoc {
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

interface UsageLimitDoc {
  userId: string;
  date: string;
  kind: string;
  count: number;
  created_at: Date;
  updated_at: Date;
}

interface JinaUsageDoc {
  date: string;
  keyHash: string;
  calls: number;
  successCalls: number;
  failureCalls: number;
  estimatedTokens: number;
  lastStatus: number | null;
  lastErrorCode?: string;
  lastErrorAt?: Date;
  alertThreshold: number;
  alertedAt: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface FirecrawlUsageDoc {
  month: string;
  calls: number;
  successCalls: number;
  failureCalls: number;
  lastStatus: number | null;
  lastErrorCode?: string;
  lastErrorAt?: Date;
  alertedAt: Date | null;
  created_at: Date;
  updated_at: Date;
}

type ScrapeResult = {
  ok: true;
  markdown: string;
  status: number;
  errorCode: null;
  provider: ScrapeMethod;
} | {
  ok: false;
  markdown: null;
  status: number | null;
  errorCode: string;
  provider: ScrapeMethod;
};

export class UrlScrapeHttpError extends Error {
  status: number;
  code: string;
  usage: UrlUsage;
  extensionUrl: string | null;

  constructor({
    status,
    code,
    message,
    usage,
    extensionUrl,
  }: {
    status: number;
    code: string;
    message: string;
    usage: UrlUsage;
    extensionUrl: string | null;
  }) {
    super(message);
    this.status = status;
    this.code = code;
    this.usage = usage;
    this.extensionUrl = extensionUrl;
  }
}

class ScrapeFailure extends Error {
  code: string;
  providerStatus?: number | null;

  constructor(code: string, message: string, providerStatus?: number | null) {
    super(message);
    this.code = code;
    this.providerStatus = providerStatus;
  }
}

type ScrapeErrorCategory = 'site_blocked' | 'service_unavailable' | 'extraction_failed' | 'no_content' | 'other';

function classifyErrorCategory(code: string): ScrapeErrorCategory {
  if (code === 'site_blocks_reader' || code.endsWith('_target_unreadable')) {
    return 'site_blocked';
  }
  if (
    code.endsWith('_unavailable') ||
    code.endsWith('_rate_limited') ||
    code.endsWith('_fetch_failed') ||
    code.endsWith('_auth_error') ||
    code.endsWith('_balance_error') ||
    code.endsWith('_quota_exhausted') ||
    code === 'gemini_missing_api_key' ||
    code === 'gemini_quota_exceeded' ||
    code === 'jina_missing_api_key' ||
    code === 'queue_unavailable'
  ) {
    return 'service_unavailable';
  }
  if (code === 'gemini_extraction_failed') {
    return 'extraction_failed';
  }
  return 'other';
}

export function parseFromUrlRequest(body: unknown) {
  return RequestSchema.safeParse(body);
}

export function parseRetryRequest(body: unknown) {
  return RetrySchema.safeParse(body);
}

export async function getFromUrlMeta(userId: string) {
  return {
    usage: await getUrlUsage(userId),
    extensionUrl: getExtensionUrl(),
  };
}

export async function createApplicationFromUrl(userId: string, url: string) {
  const url_hash = sha256(url);
  const jobPostings = await getCollection<JobPostingDoc>('job_postings');
  const cached = await jobPostings.findOne({ url_hash });
  const currentUsage = await getUrlUsage(userId);

  if (cached?._id && isReadyJobPosting(cached)) {
    const applicationId = await createOrGetApplication(userId, cached._id.toString());
    return {
      applicationId,
      jobPostingId: cached._id.toString(),
      scrapeStatus: 'succeeded' as ScrapeStatus,
      cached: true,
      usage: currentUsage,
      extensionUrl: getExtensionUrl(),
    };
  }

  if (
    cached?._id &&
    (cached.scrape_status === 'queued' || cached.scrape_status === 'processing')
  ) {
    const applicationId = await createOrGetApplication(userId, cached._id.toString());
    return {
      applicationId,
      jobPostingId: cached._id.toString(),
      scrapeStatus: cached.scrape_status,
      cached: false,
      usage: currentUsage,
      extensionUrl: getExtensionUrl(),
    };
  }

  if (currentUsage.isBlocked) {
    throw new UrlScrapeHttpError({
      status: 429,
      code: 'url_paste_limit_exceeded',
      message: "Limite d'ajout par URL atteinte pour aujourd'hui. Utilise l'extension pour continuer sans limite.",
      usage: currentUsage,
      extensionUrl: getExtensionUrl(),
    });
  }

  const usageAfterIncrement = await incrementUrlUsage(userId);
  if (!usageAfterIncrement) {
    const usage = await getUrlUsage(userId);
    throw new UrlScrapeHttpError({
      status: 429,
      code: 'url_paste_limit_exceeded',
      message: "Limite d'ajout par URL atteinte pour aujourd'hui. Utilise l'extension pour continuer sans limite.",
      usage,
      extensionUrl: getExtensionUrl(),
    });
  }

  const { jobPostingId, attempt } = await createOrResetQueuedJobPosting({
    cached,
    url,
    url_hash,
  });
  const applicationId = await createOrGetApplication(userId, jobPostingId);

  try {
    const messageId = await enqueueUrlScrapeJob({
      jobPostingId,
      userId,
      url,
      url_hash,
      attempt,
    });

    if (messageId) {
      await jobPostings.updateOne(
        { _id: new ObjectId(jobPostingId), scrape_attempts: attempt },
        { $set: { scrape_message_id: messageId, updated_at: new Date() } },
      );
    }

    return {
      applicationId,
      jobPostingId,
      scrapeStatus: 'queued' as ScrapeStatus,
      cached: false,
      usage: usageAfterIncrement,
      extensionUrl: getExtensionUrl(),
    };
  } catch (err) {
    const usageAfterRelease = await releaseUrlUsage(userId);
    await markScrapeFailed({
      jobPostingId,
      attempt,
      userId,
      message: queueFailureMessage(err),
      code: 'queue_unavailable',
      releaseUsage: false,
    });

    return {
      applicationId,
      jobPostingId,
      scrapeStatus: 'failed' as ScrapeStatus,
      cached: false,
      usage: usageAfterRelease,
      extensionUrl: getExtensionUrl(),
    };
  }
}

export async function retryApplicationFromUrl(userId: string, applicationId: string) {
  if (!ObjectId.isValid(applicationId)) {
    throw new UrlScrapeHttpError({
      status: 400,
      code: 'invalid_application_id',
      message: 'Invalid application id',
      usage: await getUrlUsage(userId),
      extensionUrl: getExtensionUrl(),
    });
  }

  const applications = await getCollection<ApplicationDoc>('applications');
  const app = await applications.findOne({ _id: new ObjectId(applicationId), userId });
  if (!app) {
    throw new UrlScrapeHttpError({
      status: 404,
      code: 'application_not_found',
      message: 'Candidature introuvable.',
      usage: await getUrlUsage(userId),
      extensionUrl: getExtensionUrl(),
    });
  }

  if (!ObjectId.isValid(app.jobPostingId)) {
    throw new UrlScrapeHttpError({
      status: 400,
      code: 'invalid_job_posting_id',
      message: 'Offre invalide.',
      usage: await getUrlUsage(userId),
      extensionUrl: getExtensionUrl(),
    });
  }

  const jobPostings = await getCollection<JobPostingDoc>('job_postings');
  const jp = await jobPostings.findOne({ _id: new ObjectId(app.jobPostingId) });
  if (!jp?._id) {
    throw new UrlScrapeHttpError({
      status: 404,
      code: 'job_posting_not_found',
      message: 'Offre introuvable.',
      usage: await getUrlUsage(userId),
      extensionUrl: getExtensionUrl(),
    });
  }

  const status = getScrapeStatus(jp);
  const usage = await getUrlUsage(userId);
  if (status === 'succeeded') {
    return {
      applicationId,
      jobPostingId: jp._id.toString(),
      scrapeStatus: 'succeeded' as ScrapeStatus,
      usage,
      extensionUrl: getExtensionUrl(),
    };
  }

  const shouldChargeUsage = status === 'failed';
  if (shouldChargeUsage && usage.isBlocked) {
    throw new UrlScrapeHttpError({
      status: 429,
      code: 'url_paste_limit_exceeded',
      message: "Limite d'ajout par URL atteinte pour aujourd'hui. Utilise l'extension pour continuer sans limite.",
      usage,
      extensionUrl: getExtensionUrl(),
    });
  }

  const usageAfterIncrement = shouldChargeUsage
    ? await incrementUrlUsage(userId)
    : usage;
  if (!usageAfterIncrement) {
    const nextUsage = await getUrlUsage(userId);
    throw new UrlScrapeHttpError({
      status: 429,
      code: 'url_paste_limit_exceeded',
      message: "Limite d'ajout par URL atteinte pour aujourd'hui. Utilise l'extension pour continuer sans limite.",
      usage: nextUsage,
      extensionUrl: getExtensionUrl(),
    });
  }

  const attempt = normalizeCount(jp.scrape_attempts) + 1;
  const now = new Date();
  await jobPostings.updateOne(
    { _id: jp._id },
    {
      $set: {
        scrape_status: 'queued',
        scrape_steps: buildInitialSteps(now),
        scrape_attempts: attempt,
        scrape_error: null,
        scrape_error_code: null,
        scrape_error_category: null,
        scrape_message_id: null,
        scrape_started_at: null,
        scrape_finished_at: null,
        updated_at: now,
      },
    },
  );

  try {
    const messageId = await enqueueUrlScrapeJob({
      jobPostingId: jp._id.toString(),
      userId,
      url: jp.url,
      url_hash: jp.url_hash,
      attempt,
    });

    if (messageId) {
      await jobPostings.updateOne(
        { _id: jp._id, scrape_attempts: attempt },
        { $set: { scrape_message_id: messageId, updated_at: new Date() } },
      );
    }
  } catch (err) {
    const usageAfterRelease = shouldChargeUsage
      ? await releaseUrlUsage(userId)
      : usageAfterIncrement;
    await markScrapeFailed({
      jobPostingId: jp._id.toString(),
      attempt,
      userId,
      message: queueFailureMessage(err),
      code: 'queue_unavailable',
      releaseUsage: false,
    });

    return {
      applicationId,
      jobPostingId: jp._id.toString(),
      scrapeStatus: 'failed' as ScrapeStatus,
      usage: usageAfterRelease,
      extensionUrl: getExtensionUrl(),
    };
  }

  return {
    applicationId,
    jobPostingId: jp._id.toString(),
    scrapeStatus: 'queued' as ScrapeStatus,
    usage: usageAfterIncrement,
    extensionUrl: getExtensionUrl(),
  };
}

export async function processUrlScrapeMessage(
  message: UrlScrapeJobMessage,
  metadata?: { messageId: string; deliveryCount: number },
) {
  if (!ObjectId.isValid(message.jobPostingId)) return;

  const jobPostings = await getCollection<JobPostingDoc>('job_postings');
  const id = new ObjectId(message.jobPostingId);
  const job = await jobPostings.findOne({ _id: id, url_hash: message.url_hash });
  if (!job?._id) return;
  if (getScrapeStatus(job) === 'succeeded') return;
  if (normalizeCount(job.scrape_attempts) !== message.attempt) return;

  let steps = job.scrape_steps?.length
    ? job.scrape_steps
    : buildInitialSteps(job.created_at ?? new Date());

  try {
    const startedAt = new Date();
    steps = markStep(steps, 'fetch', 'processing', startedAt);
    await jobPostings.updateOne(
      { _id: id, scrape_attempts: message.attempt },
      {
        $set: {
          scrape_status: 'processing',
          scrape_steps: steps,
          scrape_started_at: startedAt,
          scrape_finished_at: null,
          scrape_error: null,
          scrape_error_code: null,
          scrape_error_category: null,
          scrape_message_id: metadata?.messageId ?? job.scrape_message_id ?? null,
          updated_at: startedAt,
        },
      },
    );

    const scrapeResult = await scrapeWithFallback(message.url);

    if (!scrapeResult.ok) {
      const status = isTransientScrapeError(scrapeResult.errorCode) ? 503 : 422;

      throw new ScrapeFailure(
        scrapeResult.errorCode,
        status === 503
          ? 'Service de récupération temporairement indisponible.'
          : unreadableUrlMessage(message.url),
        scrapeResult.status,
      );
    }

    if (isBlockedOrErrorContent({
      title: '',
      company: '',
      content: scrapeResult.markdown,
      status: scrapeResult.status,
    })) {
      throw new ScrapeFailure('site_blocks_reader', blockedScrapeMessage(message.url), scrapeResult.status);
    }

    steps = markStep(steps, 'fetch', 'succeeded', new Date());
    steps = markStep(steps, 'extract', 'processing', new Date());
    await updateScrapeSteps(id, message.attempt, steps);

    const geminiApiKey = getEnv('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new ScrapeFailure('gemini_missing_api_key', "Service d'analyse temporairement indisponible.");
    }

    const quotaOk = await checkAndIncrementGeminiQuota();
    if (!quotaOk) {
      throw new ScrapeFailure('gemini_quota_exceeded', "Quota d'analyse atteint, réessayez demain.");
    }

    const extraction = await extractWithGemini(scrapeResult.markdown, message.url, geminiApiKey);
    if (!extraction) {
      throw new ScrapeFailure('gemini_extraction_failed', "Impossible d'extraire les informations principales de cette offre.");
    }

    steps = markStep(steps, 'extract', 'succeeded', new Date());
    steps = markStep(steps, 'normalize', 'processing', new Date());
    await updateScrapeSteps(id, message.attempt, steps);

    const source = detectSource(message.url);
    const locationNormalization = await normalizeLocationForStorage(extraction.location);
    const now = new Date();
    steps = markStep(steps, 'normalize', 'succeeded', now);
    steps = markStep(steps, 'complete', 'succeeded', now);

    await jobPostings.updateOne(
      { _id: id, scrape_attempts: message.attempt },
      {
        $set: {
          url: message.url,
          url_hash: message.url_hash,
          source,
          title: extraction.title,
          company: extraction.company,
          ...locationNormalization,
          description: extraction.description,
          description_source: 'scrape',
          contract_type: extraction.contract_type,
          remote: extraction.remote,
          salary: extraction.salary,
          requirements: extraction.requirements,
          keywords: extraction.keywords,
          company_website: extraction.company_website,
          scrape_method: scrapeResult.provider,
          scraped_at: now,
          scrape_status: 'succeeded',
          scrape_steps: steps,
          scrape_error: null,
          scrape_error_code: null,
          scrape_error_category: null,
          scrape_finished_at: now,
          updated_at: now,
        },
      },
    );
  } catch (err) {
    const failure = toScrapeFailure(err, message.url);
    await markScrapeFailed({
      jobPostingId: message.jobPostingId,
      attempt: message.attempt,
      userId: message.userId,
      message: failure.message,
      code: failure.code,
      steps,
      releaseUsage: true,
    });
  }
}

async function createOrResetQueuedJobPosting({
  cached,
  url,
  url_hash,
}: {
  cached: JobPostingDoc | null;
  url: string;
  url_hash: string;
}) {
  const jobPostings = await getCollection<JobPostingDoc>('job_postings');
  const now = new Date();
  const attempt = normalizeCount(cached?.scrape_attempts) + 1;
  const placeholder = buildPlaceholderJobPosting(url, url_hash, attempt, now);

  if (cached?._id) {
    await jobPostings.updateOne(
      { _id: cached._id },
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
    { url_hash },
    { $setOnInsert: placeholder },
    { upsert: true, returnDocument: 'after' },
  );

  if (!result?._id) {
    const existing = await jobPostings.findOne({ url_hash });
    if (!existing?._id) throw new Error('Unable to create queued job posting');
    return {
      jobPostingId: existing._id.toString(),
      attempt: normalizeCount(existing.scrape_attempts) || 1,
    };
  }

  return { jobPostingId: result._id.toString(), attempt };
}

function buildPlaceholderJobPosting(
  url: string,
  url_hash: string,
  attempt: number,
  now: Date,
): JobPostingDoc {
  const domain = getDisplayDomain(url);

  return {
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

async function createOrGetApplication(userId: string, jobPostingId: string) {
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

async function enqueueUrlScrapeJob(message: UrlScrapeJobMessage) {
  ensureDevConsumerRegistered();

  try {
    const result = await queue.send(URL_SCRAPE_TOPIC, message, {
      idempotencyKey: `url-scrape:${message.jobPostingId}:${message.attempt}`,
      retentionSeconds: 86400,
    });
    return result.messageId;
  } catch (err) {
    if (err instanceof DuplicateMessageError) return null;
    throw err;
  }
}

function ensureDevConsumerRegistered() {
  if (process.env.NODE_ENV !== 'development' || didRegisterDevConsumer) return;

  registerDevConsumer({
    topic: URL_SCRAPE_TOPIC,
    client: queue,
    consumerGroup: 'joblog-url-scrape-dev',
    visibilityTimeoutSeconds: 300,
    retry: (_error, metadata) => {
      if (metadata.deliveryCount > 3) return { acknowledge: true };
      return { afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5) };
    },
    handler: async (message, metadata) => {
      const parsed = UrlScrapeJobMessageSchema.safeParse(message);
      if (!parsed.success) {
        console.warn('[queue/scrape-url:dev] invalid message', parsed.error.flatten());
        return;
      }

      await processUrlScrapeMessage(parsed.data, metadata);
    },
  });

  didRegisterDevConsumer = true;
}

async function updateScrapeSteps(jobPostingId: ObjectId, attempt: number, steps: ScrapeStep[]) {
  await (await getCollection<JobPostingDoc>('job_postings')).updateOne(
    { _id: jobPostingId, scrape_attempts: attempt },
    { $set: { scrape_steps: steps, updated_at: new Date() } },
  );
}

async function markScrapeFailed({
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

function buildInitialSteps(now: Date): ScrapeStep[] {
  return SCRAPE_STEP_KEYS.map((key) => ({
    key,
    label: STEP_LABELS[key],
    status: key === 'created' ? 'succeeded' : 'pending',
    at: key === 'created' ? now : null,
    message: null,
  }));
}

function markStep(
  steps: ScrapeStep[],
  key: ScrapeStep['key'],
  status: ScrapeStep['status'],
  at: Date,
  message?: string | null,
) {
  return steps.map((step) =>
    step.key === key
      ? { ...step, status, at, message: message ?? step.message ?? null }
      : step,
  );
}

function markCurrentStepFailed(steps: ScrapeStep[], message: string) {
  const active =
    steps.find((step) => step.status === 'processing') ??
    steps.find((step) => step.status === 'pending') ??
    steps[steps.length - 1];

  return steps.map((step) =>
    step.key === active.key
      ? { ...step, status: 'failed' as const, at: new Date(), message }
      : step,
  );
}

function getScrapeStatus(jobPosting: JobPostingDoc): ScrapeStatus {
  if (
    jobPosting.scrape_status === 'queued' ||
    jobPosting.scrape_status === 'processing' ||
    jobPosting.scrape_status === 'failed' ||
    jobPosting.scrape_status === 'succeeded'
  ) {
    return jobPosting.scrape_status;
  }

  return isBlockedLegacyJobPosting(jobPosting) ? 'failed' : 'succeeded';
}

function isReadyJobPosting(jobPosting: JobPostingDoc) {
  return getScrapeStatus(jobPosting) === 'succeeded' && !isBlockedLegacyJobPosting(jobPosting);
}

function isBlockedLegacyJobPosting(jobPosting: JobPostingDoc) {
  if (jobPosting.scrape_status) return false;

  return isBlockedOrErrorContent({
    title: String(jobPosting.title ?? ''),
    company: String(jobPosting.company ?? ''),
    content: String(jobPosting.description ?? ''),
    status: null,
  });
}

async function fetchJinaMarkdown(url: string, apiKey: string): Promise<ScrapeResult> {
  try {
    const resp = await fetch(`${JINA_READER_URL}${url}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/plain',
        'X-Respond-With': 'markdown',
        'X-Remove-Selector': 'script, style, noscript, header, nav, footer',
      },
      signal: AbortSignal.timeout(25_000),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return {
        ok: false,
        markdown: null,
        status: resp.status,
        errorCode: classifyJinaHttpError(resp.status, text),
        provider: 'jina',
      };
    }

    return { ok: true, markdown: text, status: resp.status, errorCode: null, provider: 'jina' };
  } catch {
    return {
      ok: false,
      markdown: null,
      status: null,
      errorCode: 'jina_fetch_failed',
      provider: 'jina',
    };
  }
}

function classifyJinaHttpError(status: number, body: string) {
  const text = body.toLowerCase();
  if (status === 401 || text.includes('auth_missing') || text.includes('auth_invalid')) {
    return 'jina_auth_error';
  }
  if (
    status === 403 &&
    (text.includes('insufficient') || text.includes('balance') || text.includes('authz_'))
  ) {
    return 'jina_balance_error';
  }
  if (status === 429 || text.includes('rate_') || text.includes('rate limit')) {
    return 'jina_rate_limited';
  }
  if (status >= 500) return 'jina_unavailable';
  return 'jina_target_unreadable';
}

async function fetchFirecrawlMarkdown(url: string, apiKey: string): Promise<ScrapeResult> {
  try {
    const resp = await fetch(FIRECRAWL_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      signal: AbortSignal.timeout(25_000),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return {
        ok: false,
        markdown: null,
        status: resp.status,
        errorCode: classifyFirecrawlHttpError(resp.status, text),
        provider: 'firecrawl',
      };
    }

    const data = JSON.parse(text) as { data?: { markdown?: string; metadata?: { statusCode?: number } } };
    const markdown = data.data?.markdown;
    if (!markdown) {
      return {
        ok: false,
        markdown: null,
        status: resp.status,
        errorCode: 'firecrawl_target_unreadable',
        provider: 'firecrawl',
      };
    }

    return {
      ok: true,
      markdown,
      status: data.data?.metadata?.statusCode ?? resp.status,
      errorCode: null,
      provider: 'firecrawl',
    };
  } catch {
    return {
      ok: false,
      markdown: null,
      status: null,
      errorCode: 'firecrawl_fetch_failed',
      provider: 'firecrawl',
    };
  }
}

function classifyFirecrawlHttpError(status: number, body: string) {
  const text = body.toLowerCase();
  if (status === 401 || text.includes('unauthorized') || text.includes('invalid api key')) {
    return 'firecrawl_auth_error';
  }
  if (status === 402 || text.includes('insufficient credits') || text.includes('payment required')) {
    return 'firecrawl_quota_exhausted';
  }
  if (status === 429 || text.includes('rate limit')) {
    return 'firecrawl_rate_limited';
  }
  if (status >= 500) return 'firecrawl_unavailable';
  return 'firecrawl_target_unreadable';
}

function isFirecrawlTransientError(errorCode: string) {
  return errorCode === 'firecrawl_auth_error' ||
    errorCode === 'firecrawl_quota_exhausted' ||
    errorCode === 'firecrawl_rate_limited' ||
    errorCode === 'firecrawl_unavailable' ||
    errorCode === 'firecrawl_fetch_failed';
}

function isTransientScrapeError(errorCode: string) {
  return errorCode === 'jina_auth_error' ||
    errorCode === 'jina_balance_error' ||
    errorCode === 'jina_rate_limited' ||
    errorCode === 'jina_unavailable' ||
    errorCode === 'jina_fetch_failed' ||
    isFirecrawlTransientError(errorCode);
}

async function scrapeWithFallback(url: string): Promise<ScrapeResult> {
  const firecrawlApiKey = getEnv('FIRECRAWL_API_KEY');

  if (firecrawlApiKey) {
    const reserved = await reserveFirecrawlSlot();
    if (reserved) {
      const result = await fetchFirecrawlMarkdown(url, firecrawlApiKey);
      await recordFirecrawlUsage({ status: result.status, errorCode: result.errorCode });

      if (result.ok) return result;

      if (!isFirecrawlTransientError(result.errorCode)) return result;

      await releaseFirecrawlSlot();
    }
  }

  const jinaApiKey = getEnv('JINA_API_KEY');
  if (!jinaApiKey) {
    throw new ScrapeFailure('jina_missing_api_key', 'Service de récupération temporairement indisponible.');
  }

  const jinaResult = await fetchJinaMarkdown(url, jinaApiKey);
  await recordJinaUsage({
    apiKey: jinaApiKey,
    status: jinaResult.status,
    outputChars: jinaResult.markdown?.length ?? 0,
    errorCode: jinaResult.errorCode,
  });

  return jinaResult;
}

async function extractWithGemini(
  markdown: string,
  url: string,
  apiKey: string,
): Promise<NormalizedExtraction | null> {
  try {
    const model = getEnv('GEMINI_MODEL') ?? GEMINI_MODEL;
    const boundedMarkdown = normalizeWhitespace(markdown)
      .slice(0, MAX_MARKDOWN_CHARS_FOR_GEMINI);

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: buildGeminiPrompt(url, boundedMarkdown),
            }],
          }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(20_000),
      }
    );

    if (!resp.ok) return null;
    const data = await resp.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = GeminiExtractionSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;

    return normalizeGeminiExtraction(parsed.data, boundedMarkdown);
  } catch {
    return null;
  }
}

function buildGeminiPrompt(url: string, markdown: string) {
  return `Extrait les informations principales de cette offre d'emploi depuis le markdown ci-dessous.
Réponds uniquement en JSON strict avec ces clés:
{
  "readable": boolean,
  "failure_reason": "blocked" | "login_required" | "not_job_posting" | "empty" | "other" | null,
  "title": string | null,
  "company": string | null,
  "location": string | null,
  "description": string | null,
  "contract_type": "cdi" | "cdd" | "alternance" | "stage" | "freelance" | null,
  "remote": "remote" | "hybride" | "présentiel" | null,
  "salary": { "min": number | null, "max": number | null, "currency": string | null, "period": "month" | "year" | null } | null,
  "requirements": string[] | null,
  "keywords": string[] | null,
  "company_website": string | null
}

Règles:
- readable vaut false si le markdown est une page de blocage, login obligatoire, captcha/challenge, erreur technique, page vide, liste de résultats, ou pas une offre d'emploi unique.
- Si readable vaut false, failure_reason doit être l'une des valeurs autorisées et tous les champs métier doivent être null.
- title et company doivent venir de l'offre, pas du nom du job board.
- N'invente jamais title ou company. Si tu n'es pas sûr, utilise null.
- description doit être le texte utile de l'offre, sans navigation ni texte de login, 6000 caractères maximum.
- company_website doit être le domaine officiel de l'entreprise si un lien clair existe, sinon null. Ne renvoie pas le domaine du job board.
- requirements contient 3 à 10 prérequis/compétences concrets si visibles.
- keywords contient 3 à 12 mots-clés utiles pour retrouver l'offre.
- Si une information est introuvable, utilise null.

URL: ${url}
Markdown:
"""${markdown}"""`;
}

function normalizeGeminiExtraction(
  raw: z.infer<typeof GeminiExtractionSchema>,
  markdown: string,
): NormalizedExtraction | null {
  if (raw.readable === false) return null;

  const title = cleanText(raw.title);
  const company = cleanText(raw.company);
  if (!title || !company) return null;

  const searchableText = [
    raw.contract_type,
    raw.remote,
    raw.description,
    markdown.slice(0, 5000),
  ].filter(Boolean).join(' ');

  const contract_type = normalizeContractType(raw.contract_type, searchableText);
  const remote = normalizeRemote(raw.remote, searchableText);
  const description = cleanText(raw.description)?.slice(0, MAX_DESCRIPTION_CHARS) ??
    markdown.slice(0, MAX_DESCRIPTION_CHARS);

  if (isBlockedOrErrorContent({ title, company, content: description, status: null })) {
    return null;
  }

  return {
    title,
    company,
    location: cleanText(raw.location) ?? null,
    description,
    contract_type,
    remote,
    salary: normalizeSalary(raw.salary),
    requirements: normalizeStringArray(raw.requirements),
    keywords: normalizeStringArray(raw.keywords),
    company_website: normalizeCompanyDomain(raw.company_website ?? ''),
  };
}

function normalizeContractType(value: string | null | undefined, fallback: string) {
  if (value && (CONTRACT_TYPES as readonly string[]).includes(value)) {
    return value as ContractType;
  }
  return parseContractType([value, fallback].filter(Boolean).join(' '));
}

function normalizeRemote(value: string | null | undefined, fallback: string) {
  if (value && (REMOTE_TYPES as readonly string[]).includes(value)) {
    return value as RemoteType;
  }
  return parseRemote([value, fallback].filter(Boolean).join(' '));
}

function normalizeSalary(value: z.infer<typeof SalarySchema>) {
  if (!value || typeof value !== 'object') return null;
  const min = typeof value.min === 'number' && Number.isFinite(value.min) ? value.min : null;
  const max = typeof value.max === 'number' && Number.isFinite(value.max) ? value.max : null;
  const currency = cleanText(value.currency) ?? null;
  const period = value.period === 'month' || value.period === 'year' ? value.period : null;
  if (min === null && max === null && !currency && !period) return null;
  return { min, max, currency, period };
}

function normalizeStringArray(value: string[] | null | undefined) {
  if (!Array.isArray(value)) return null;
  const items = [...new Set(value.map((item) => cleanText(item)).filter(Boolean) as string[])]
    .slice(0, 12);
  return items.length ? items : null;
}

function normalizeCompanyDomain(raw: string) {
  const value = cleanText(raw);
  if (!value) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const domain = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (!domain.includes('.')) return null;
    if (isIgnoredCompanyDomain(domain)) return null;
    return domain;
  } catch {
    return null;
  }
}

function isIgnoredCompanyDomain(domain: string) {
  return [
    'welcometothejungle.com',
    'linkedin.com',
    'hellowork.com',
    'jobijoba.com',
    'indeed.com',
    'glassdoor.com',
    'jobteaser.com',
    'greenhouse.io',
    'lever.co',
    'workable.com',
    'ashbyhq.com',
    'smartrecruiters.com',
    'recruitee.com',
    'teamtailor.com',
    'breezy.hr',
    'personio.com',
    'successfactors.com',
    'myworkdayjobs.com',
    'workdayjobs.com',
    'icims.com',
    'facebook.com',
    'instagram.com',
    'x.com',
    'twitter.com',
    'youtube.com',
    'tiktok.com',
  ].some((ignored) => domain === ignored || domain.endsWith(`.${ignored}`));
}

function isBlockedOrErrorContent(input: {
  title: string;
  company: string;
  content: string;
  status: number | null;
}) {
  const text = `${input.title} ${input.company} ${input.content}`.toLowerCase();

  if (input.status !== null && input.status >= 400) return true;
  if (input.title.trim().toLowerCase() === '403 error') return true;
  if (text.includes('403 error')) return true;
  if (text.includes('access denied')) return true;
  if (text.includes('not a robot')) return true;
  if (text.includes("verify that you're not a robot")) return true;
  if (looksLikeCaptchaChallenge(text)) return true;
  if (text.includes('javascript is disabled')) return true;
  if (text.includes('enable javascript and then reload the page')) return true;
  if (text.includes('sign in to view')) return true;
  if (text.includes('log in to view')) return true;
  if (text.includes('authwall')) return true;
  if (text.includes('just a moment...') && text.includes('cloudflare')) return true;

  return false;
}

function looksLikeCaptchaChallenge(text: string) {
  const hasCaptcha = text.includes('captcha') || text.includes('recaptcha');
  if (!hasCaptcha) return false;

  const cookiePanelContext =
    text.includes('gestion des cookies') ||
    text.includes('cookie consent') ||
    text.includes('services tiers') ||
    text.includes("ce service n'a déposé aucun cookie") ||
    text.includes('politique de confidentialité');

  const challengeContext =
    text.includes('captcha challenge') ||
    text.includes('captcha required') ||
    text.includes('captcha verification') ||
    text.includes('complete the security check') ||
    text.includes('solve the captcha') ||
    text.includes('verify you are human') ||
    text.includes("verify that you're not a robot") ||
    text.includes('unusual traffic') ||
    text.includes('automated requests');

  if (cookiePanelContext && !challengeContext) return false;
  return challengeContext;
}

function blockedScrapeMessage(url: string) {
  if (url.includes('welcometothejungle.com')) {
    return "Welcome to the Jungle bloque peut-être la récupération depuis le dashboard. Ouvre l'offre dans ton navigateur et sauvegarde-la via l'extension.";
  }

  if (url.includes('francetravail.fr')) {
    return "France Travail charge parfois l'employeur côté navigateur. Ouvre l'offre dans ton navigateur et sauvegarde-la via l'extension JobLog.";
  }

  if (url.includes('linkedin.com')) {
    return "LinkedIn bloque souvent les lectures serveur. Ouvre l'offre dans ton navigateur et sauvegarde-la via l'extension JobLog.";
  }

  return "Le site bloque la récupération automatique. Ouvre l'offre dans ton navigateur et sauvegarde-la via l'extension.";
}

function unreadableUrlMessage(url: string) {
  if (url.includes('linkedin.com')) {
    return "LinkedIn est illisible automatiquement ou bloque la récupération serveur. L'extension reste le chemin le plus fiable.";
  }

  return "Impossible de lire cette URL automatiquement. Le site peut bloquer la récupération serveur, être indisponible, ou renvoyer une page que le service de lecture ne peut pas convertir.";
}

async function getUrlUsage(userId: string): Promise<UrlUsage> {
  const col = await getCollection<UsageLimitDoc>('usage_limits');
  const date = getParisDateKey();
  const usage = await col.findOne({ userId, date, kind: URL_USAGE_KIND });
  const count = normalizeCount(usage?.count);

  return buildUrlUsage(date, count);
}

async function incrementUrlUsage(userId: string): Promise<UrlUsage | null> {
  const col = await getCollection<UsageLimitDoc>('usage_limits');
  const date = getParisDateKey();
  const now = new Date();
  const result = await col.findOneAndUpdate(
    {
      userId,
      date,
      kind: URL_USAGE_KIND,
      count: { $lt: URL_USAGE_LIMIT },
    },
    {
      $inc: { count: 1 },
      $set: { updated_at: now },
      $setOnInsert: {
        userId,
        date,
        kind: URL_USAGE_KIND,
        created_at: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  if (!result) return null;
  return buildUrlUsage(date, normalizeCount(result.count));
}

async function releaseUrlUsage(userId: string): Promise<UrlUsage> {
  const col = await getCollection<UsageLimitDoc>('usage_limits');
  const date = getParisDateKey();
  const now = new Date();
  const result = await col.findOneAndUpdate(
    {
      userId,
      date,
      kind: URL_USAGE_KIND,
      count: { $gt: 0 },
    },
    {
      $inc: { count: -1 },
      $set: { updated_at: now },
    },
    { returnDocument: 'after' },
  );

  return buildUrlUsage(date, normalizeCount(result?.count));
}

function buildUrlUsage(date: string, count: number): UrlUsage {
  return {
    date,
    count,
    warningAt: URL_USAGE_WARNING_AT,
    limit: URL_USAGE_LIMIT,
    remaining: Math.max(0, URL_USAGE_LIMIT - count),
    shouldWarn: count >= URL_USAGE_WARNING_AT,
    isBlocked: count >= URL_USAGE_LIMIT,
  };
}

function normalizeCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

async function checkAndIncrementGeminiQuota(): Promise<boolean> {
  const col = await getCollection('quota_usage');
  const today = new Date().toISOString().slice(0, 10);
  const maxScrapeCalls = Math.max(0, GEMINI_DAILY_QUOTA - GEMINI_SCRAPE_RESERVE);

  const result = await col.findOneAndUpdate(
    { date: today, calls: { $lt: maxScrapeCalls } },
    { $inc: { calls: 1 }, $setOnInsert: { date: today } },
    { upsert: true, returnDocument: 'after' },
  );

  return result !== null;
}

async function recordJinaUsage({
  apiKey,
  status,
  outputChars,
  errorCode,
}: {
  apiKey: string;
  status: number | null;
  outputChars: number;
  errorCode: string | null;
}) {
  const col = await getCollection<JinaUsageDoc>('jina_usage');
  const date = getParisDateKey();
  const now = new Date();
  const estimatedTokens = estimateTokens(outputChars);
  const keyHash = sha256(apiKey).slice(0, 16);
  const isSuccess = !errorCode;
  const alertThreshold = getJinaAlertThreshold();

  await col.updateOne(
    { date, keyHash },
    {
      $inc: {
        calls: 1,
        successCalls: isSuccess ? 1 : 0,
        failureCalls: isSuccess ? 0 : 1,
        estimatedTokens,
      },
      $set: {
        updated_at: now,
        lastStatus: status,
        alertThreshold,
        ...(errorCode ? { lastErrorCode: errorCode, lastErrorAt: now } : {}),
      },
      $setOnInsert: {
        date,
        keyHash,
        created_at: now,
        alertedAt: null,
      },
    },
    { upsert: true },
  );
}

function estimateTokens(chars: number) {
  return Math.max(0, Math.ceil(chars / 4));
}

async function reserveFirecrawlSlot(): Promise<boolean> {
  const col = await getCollection<FirecrawlUsageDoc>('firecrawl_usage');
  const month = getParisMonthKey();
  const now = new Date();

  const result = await col.findOneAndUpdate(
    { month, calls: { $lt: FIRECRAWL_MONTHLY_SOFT_CAP } },
    {
      $inc: { calls: 1 },
      $set: { updated_at: now },
      $setOnInsert: {
        month,
        successCalls: 0,
        failureCalls: 0,
        lastStatus: null,
        alertedAt: null,
        created_at: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  return result !== null;
}

async function releaseFirecrawlSlot() {
  const col = await getCollection<FirecrawlUsageDoc>('firecrawl_usage');
  const month = getParisMonthKey();

  await col.updateOne(
    { month, calls: { $gt: 0 } },
    { $inc: { calls: -1 }, $set: { updated_at: new Date() } },
  );
}

async function recordFirecrawlUsage({
  status,
  errorCode,
}: {
  status: number | null;
  errorCode: string | null;
}) {
  const col = await getCollection<FirecrawlUsageDoc>('firecrawl_usage');
  const month = getParisMonthKey();
  const now = new Date();
  const isSuccess = !errorCode;

  await col.updateOne(
    { month },
    {
      $inc: {
        successCalls: isSuccess ? 1 : 0,
        failureCalls: isSuccess ? 0 : 1,
      },
      $set: {
        updated_at: now,
        lastStatus: status,
        ...(errorCode ? { lastErrorCode: errorCode, lastErrorAt: now } : {}),
      },
      $setOnInsert: {
        month,
        calls: 0,
        alertedAt: null,
        created_at: now,
      },
    },
    { upsert: true },
  );
}

function getParisMonthKey(date = new Date()) {
  return getParisDateKey(date).slice(0, 7);
}

function getJinaAlertThreshold() {
  const raw = getEnv('JINA_ESTIMATED_TOKEN_ALERT_THRESHOLD');
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? Math.trunc(parsed)
    : JINA_ALERT_THRESHOLD_DEFAULT;
}

function getParisDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: PARIS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function getExtensionUrl() {
  return getEnv('PUBLIC_EXTENSION_URL') ?? null;
}

function cleanText(value?: string | null) {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}

function detectSource(url: string): JobSource {
  if (url.includes('linkedin.com')) return 'linkedin';
  if (url.includes('welcometothejungle.com')) return 'wttj';
  if (url.includes('hellowork.com')) return 'hellowork';
  if (url.includes('indeed.com')) return 'indeed';
  if (url.includes('glassdoor.')) return 'glassdoor';
  if (url.includes('jobteaser.com')) return 'jobteaser';
  if (url.includes('jobijoba.com')) return 'jobijoba';
  if (url.includes('meteojob.com')) return 'meteojob';
  if (url.includes('apec.fr')) return 'apec';
  if (url.includes('francetravail.fr')) return 'francetravail';
  if (url.includes('cadremploi.fr')) return 'cadremploi';
  if (url.includes('talent.com')) return 'talent';
  if (url.includes('lesjeudis.com')) return 'lesjeudis';
  return 'paste';
}

function getDisplayDomain(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, '');
  } catch {
    return 'URL collée';
  }
}

function toScrapeFailure(err: unknown, url: string) {
  if (err instanceof ScrapeFailure) return err;
  const message = err instanceof Error ? err.message : unreadableUrlMessage(url);
  return new ScrapeFailure('unknown_scrape_error', message || unreadableUrlMessage(url));
}

function queueFailureMessage(err: unknown) {
  if (err instanceof Error && err.message) {
    return `La file de traitement est indisponible pour le moment. Réessaie dans quelques instants. (${err.message})`;
  }

  return 'La file de traitement est indisponible pour le moment. Réessaie dans quelques instants.';
}
