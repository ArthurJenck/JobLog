import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { type ScrapeStatus } from '@joblog/shared';
import { getCollection } from '../../../lib/db.js';
import { getEnv } from '../../../lib/env.js';
import { sha256 } from '../../../lib/hash.js';
import { normalizeLocationForStorage } from '../../../lib/addresses.js';
import {
  getUrlUsage,
  incrementUrlUsage,
  normalizeCount,
  releaseUrlUsage,
} from '../../usage/url-usage.js';
import { checkAndIncrementGeminiQuota } from '../../usage/gemini-quota.js';
import { enqueueUrlScrapeJob, type UrlScrapeJobMessage } from './queue.js';
import {
  type ApplicationDoc,
  type JobPostingDoc,
  copyJobPostingForUser,
  createOrGetApplication,
  createOrResetQueuedJobPosting,
  markScrapeFailed,
  updateScrapeSteps,
} from './store.js';
import {
  buildInitialSteps,
  getScrapeStatus,
  isReadyJobPosting,
  markStep,
} from './steps.js';
import {
  ScrapeFailure,
  UrlScrapeHttpError,
  isTransientScrapeError,
  queueFailureMessage,
  toScrapeFailure,
} from './errors.js';
import { scrapeWithFallback } from './providers.js';
import { extractWithGemini } from './gemini-extract.js';
import {
  blockedScrapeMessage,
  isBlockedOrErrorContent,
  unreadableUrlMessage,
} from './content-filters.js';
import { detectSource } from './normalize.js';

const RequestSchema = z.object({ url: z.string().url() });

const RetrySchema = z.object({ applicationId: z.string() });

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
  const cached = await jobPostings.findOne({ userId, url_hash });
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

  if (!cached) {
    const donor = await jobPostings.findOne({
      url_hash,
      userId: { $ne: userId },
      scrape_status: 'succeeded',
    });
    if (donor?._id && isReadyJobPosting(donor)) {
      const copyId = await copyJobPostingForUser(donor, userId);
      const applicationId = await createOrGetApplication(userId, copyId);
      return {
        applicationId,
        jobPostingId: copyId,
        scrapeStatus: 'succeeded' as ScrapeStatus,
        cached: true,
        usage: currentUsage,
        extensionUrl: getExtensionUrl(),
      };
    }
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
    userId,
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
  const jp = await jobPostings.findOne({ _id: new ObjectId(app.jobPostingId), userId });
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
  const job = await jobPostings.findOne({ _id: id, url_hash: message.url_hash, userId: message.userId });
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

function getExtensionUrl() {
  return getEnv('PUBLIC_EXTENSION_URL') ?? null;
}
