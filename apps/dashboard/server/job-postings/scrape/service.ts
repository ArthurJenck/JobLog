import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { type ScrapeStatus, type UrlScrapeMessageV1 } from '@joblog/shared';
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
  buildScrapeWriteFilter,
  createOrGetApplication,
  createOrResetQueuedJobPosting,
  isActiveScrapeStale,
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
import {
  isJobListUrl,
  isSupportedJobUrl,
  resolveJobPostingIdentity,
} from '../url-identity.js';
import {
  assertDedupMigrationWritesAllowed,
  MIGRATION_RETRY_AFTER_SECONDS,
  MigrationMaintenanceError,
} from '../../migrations/maintenance.js';

const RequestSchema = z.object({
  url: z.string().url().refine(isSupportedJobUrl, 'Unsupported job URL'),
});

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
  await assertUrlScrapeWritesAllowed(userId);
  if (isJobListUrl(url)) {
    throw new UrlScrapeHttpError({
      status: 400,
      code: 'job_list_url',
      message:
        "Ce lien mène sur une page de résultats, certains sites ne proposent pas de lien direct vers une offre. Utilise l'extension pour la récupérer, ou saisis-la à la main.",
      usage: await getUrlUsage(userId),
      extensionUrl: getExtensionUrl(),
    });
  }

  const identity = resolveJobPostingIdentity({ url });
  const url_hash = sha256(url);
  const jobPostings = await getCollection<JobPostingDoc>('job_postings');
  let cached = await jobPostings.findOne({ userId, dedup_key: identity.dedupKey });
  cached ??= await jobPostings.findOne({ userId, url_hash });
  if (cached?._id && !cached.dedup_key) {
    await jobPostings.updateOne(
      { _id: cached._id, userId, dedup_key: { $exists: false } },
      {
        $set: {
          dedup_key: identity.dedupKey,
          dedup_version: 2,
          source_key: identity.sourceKey,
          ...(identity.nativeJobId ? { native_job_id: identity.nativeJobId } : {}),
          url: identity.canonicalUrl,
        },
      },
    );
    cached = { ...cached, dedup_key: identity.dedupKey, dedup_version: 2 };
  }
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
    (cached.scrape_status === 'queued' || cached.scrape_status === 'processing') &&
    !isActiveScrapeStale(cached)
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

  const shouldChargeUsage = !cached || cached.scrape_status === 'failed';
  if (shouldChargeUsage && currentUsage.isBlocked) {
    throw new UrlScrapeHttpError({
      status: 429,
      code: 'url_paste_limit_exceeded',
      message: "Limite d'ajout par URL atteinte pour aujourd'hui. Utilise l'extension pour continuer sans limite.",
      usage: currentUsage,
      extensionUrl: getExtensionUrl(),
    });
  }

  const usageAfterIncrement = shouldChargeUsage
    ? await incrementUrlUsage(userId)
    : currentUsage;
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
    url: identity.canonicalUrl,
    url_hash,
    dedup_key: identity.dedupKey,
    source_key: identity.sourceKey,
    native_job_id: identity.nativeJobId,
  });
  const applicationId = await createOrGetApplication(userId, jobPostingId);

  try {
    const messageId = await enqueueUrlScrapeJob({
      jobPostingId,
      userId,
      url: identity.canonicalUrl,
      dedup_key: identity.dedupKey,
      attempt,
      version: 2,
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
    const usageAfterRelease = shouldChargeUsage
      ? await releaseUrlUsage(userId)
      : usageAfterIncrement;
    await markScrapeFailed({
      jobPostingId,
      attempt,
      userId,
      dedupKey: identity.dedupKey,
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
  await assertUrlScrapeWritesAllowed(userId);
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
  let resolvedApplicationId = applicationId;
  let app = await applications.findOne({ _id: new ObjectId(resolvedApplicationId), userId });
  if (!app) {
    const alias = await (await getCollection<{
      userId: string;
      legacyApplicationId: string;
      targetApplicationId: string;
    }>('application_aliases')).findOne({ userId, legacyApplicationId: applicationId });
    if (alias && ObjectId.isValid(alias.targetApplicationId)) {
      resolvedApplicationId = alias.targetApplicationId;
      app = await applications.findOne({ _id: new ObjectId(resolvedApplicationId), userId });
    }
  }
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
  let resolvedJobPostingId = app.jobPostingId;
  let jp = await jobPostings.findOne({ _id: new ObjectId(resolvedJobPostingId), userId });
  if (!jp) {
    const alias = await (await getCollection<{
      userId: string;
      legacyJobPostingId: string;
      targetJobPostingId: string;
    }>('job_posting_aliases')).findOne({ userId, legacyJobPostingId: app.jobPostingId });
    if (alias && ObjectId.isValid(alias.targetJobPostingId)) {
      resolvedJobPostingId = alias.targetJobPostingId;
      jp = await jobPostings.findOne({ _id: new ObjectId(resolvedJobPostingId), userId });
    }
  }
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
  const identity = resolveJobPostingIdentity({
    url: jp.url,
    source: jp.source,
    sourceKey: jp.source_key,
    nativeJobId: jp.native_job_id,
    title: typeof jp.title === 'string' ? jp.title : null,
    company: typeof jp.company === 'string' ? jp.company : null,
    location: jp.location,
  });
  if (!jp.dedup_key) {
    await jobPostings.updateOne(
      { _id: jp._id, userId, dedup_key: { $exists: false } },
      {
        $set: {
          dedup_key: identity.dedupKey,
          dedup_version: 2,
          source_key: identity.sourceKey,
          ...(identity.nativeJobId ? { native_job_id: identity.nativeJobId } : {}),
        },
      },
    );
    jp.dedup_key = identity.dedupKey;
  }
  const usage = await getUrlUsage(userId);
  if (status === 'succeeded') {
    return {
      applicationId: resolvedApplicationId,
      jobPostingId: jp._id.toString(),
      scrapeStatus: 'succeeded' as ScrapeStatus,
      usage,
      extensionUrl: getExtensionUrl(),
    };
  }

  if ((status === 'queued' || status === 'processing') && !isActiveScrapeStale(jp)) {
    return {
      applicationId: resolvedApplicationId,
      jobPostingId: jp._id.toString(),
      scrapeStatus: status,
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
  const queued = await jobPostings.updateOne(
    buildScrapeWriteFilter({
      jobPostingId: jp._id,
      userId,
      dedupKey: identity.dedupKey,
      attempt: normalizeCount(jp.scrape_attempts),
    }),
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
        manually_repaired_at: null,
        updated_at: now,
      },
    },
  );
  if (queued.matchedCount === 0) {
    const current = await jobPostings.findOne({ _id: jp._id, userId });
    return {
      applicationId: resolvedApplicationId,
      jobPostingId: jp._id.toString(),
      scrapeStatus: getScrapeStatus(current ?? jp),
      usage,
      extensionUrl: getExtensionUrl(),
    };
  }

  try {
    const messageId = await enqueueUrlScrapeJob({
      jobPostingId: jp._id.toString(),
      userId,
      url: jp.url,
      dedup_key: identity.dedupKey,
      attempt,
      version: 2,
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
      dedupKey: identity.dedupKey,
      message: queueFailureMessage(err),
      code: 'queue_unavailable',
      releaseUsage: false,
    });

    return {
      applicationId: resolvedApplicationId,
      jobPostingId: jp._id.toString(),
      scrapeStatus: 'failed' as ScrapeStatus,
      usage: usageAfterRelease,
      extensionUrl: getExtensionUrl(),
    };
  }

  return {
    applicationId: resolvedApplicationId,
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
  await assertDedupMigrationWritesAllowed();
  if (!ObjectId.isValid(message.jobPostingId)) return;

  const jobPostings = await getCollection<JobPostingDoc>('job_postings');
  let id = new ObjectId(message.jobPostingId);
  let job = await jobPostings.findOne({ _id: id, userId: message.userId });
  if (!job) {
    const alias = await (await getCollection<{
      userId: string;
      legacyJobPostingId: string;
      targetJobPostingId: string;
    }>('job_posting_aliases')).findOne({
      userId: message.userId,
      legacyJobPostingId: message.jobPostingId,
    });
    if (!alias || !ObjectId.isValid(alias.targetJobPostingId)) return;
    id = new ObjectId(alias.targetJobPostingId);
    job = await jobPostings.findOne({ _id: id, userId: message.userId });
  }
  if (!job?._id) return;
  if (getScrapeStatus(job) === 'succeeded') return;
  if (normalizeCount(job.scrape_attempts) !== message.attempt) return;

  const identity = resolveJobPostingIdentity({
    url: message.url,
    source: job.source,
    sourceKey: job.source_key,
    nativeJobId: job.native_job_id,
    title: typeof job.title === 'string' ? job.title : null,
    company: typeof job.company === 'string' ? job.company : null,
    location: job.location,
  });
  const isV1 = isUrlScrapeMessageV1(message);
  if (isV1 && sha256(message.url) !== message.url_hash) return;
  if (!isV1 && identity.dedupKey !== message.dedup_key) return;
  const dedupKey = isV1 ? identity.dedupKey : message.dedup_key;
  if (job.dedup_key && job.dedup_key !== dedupKey) return;

  if (!job.dedup_key) {
    try {
      const result = await jobPostings.updateOne(
        { _id: id, userId: message.userId, dedup_key: { $exists: false } },
        {
          $set: {
            dedup_key: dedupKey,
            dedup_version: 2,
            source_key: identity.sourceKey,
            ...(identity.nativeJobId ? { native_job_id: identity.nativeJobId } : {}),
          },
        },
      );
      if (result.matchedCount === 0) return;
      job = { ...job, dedup_key: dedupKey, dedup_version: 2 };
    } catch {
      return;
    }
  }

  if (isV1) {
    console.info('[queue/scrape-url] v1 delivery', {
      messageId: metadata?.messageId ?? null,
      deliveryCount: metadata?.deliveryCount ?? null,
    });
  }

  const guard = {
    jobPostingId: id,
    userId: message.userId,
    dedupKey,
    attempt: message.attempt,
  };

  let steps = job.scrape_steps?.length
    ? job.scrape_steps
    : buildInitialSteps(job.created_at ?? new Date());

  try {
    const startedAt = new Date();
    steps = markStep(steps, 'fetch', 'processing', startedAt);
    const started = await jobPostings.updateOne(
      buildScrapeWriteFilter(guard),
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
    if (started.matchedCount === 0) return;

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
    if (!await updateScrapeSteps(guard, steps)) return;

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
    if (!await updateScrapeSteps(guard, steps)) return;

    const source = detectSource(message.url);
    const locationNormalization = await normalizeLocationForStorage(extraction.location);
    const now = new Date();
    steps = markStep(steps, 'normalize', 'succeeded', now);
    steps = markStep(steps, 'complete', 'succeeded', now);

    await jobPostings.updateOne(
      buildScrapeWriteFilter(guard),
      {
        $set: {
          url: message.url,
          dedup_key: dedupKey,
          dedup_version: 2,
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
      jobPostingId: id.toString(),
      attempt: message.attempt,
      userId: message.userId,
      dedupKey,
      message: failure.message,
      code: failure.code,
      steps,
      releaseUsage: true,
    });
  }
}

function isUrlScrapeMessageV1(message: UrlScrapeJobMessage): message is UrlScrapeMessageV1 {
  return !('version' in message);
}

function getExtensionUrl() {
  return getEnv('PUBLIC_EXTENSION_URL') ?? null;
}

async function assertUrlScrapeWritesAllowed(userId: string) {
  try {
    await assertDedupMigrationWritesAllowed();
  } catch (error) {
    if (!(error instanceof MigrationMaintenanceError)) throw error;
    throw new UrlScrapeHttpError({
      status: 503,
      code: 'migration_maintenance',
      message: 'Maintenance temporaire en cours. Réessaie dans quelques instants.',
      usage: await getUrlUsage(userId),
      extensionUrl: getExtensionUrl(),
      retryAfter: MIGRATION_RETRY_AFTER_SECONDS,
    });
  }
}
