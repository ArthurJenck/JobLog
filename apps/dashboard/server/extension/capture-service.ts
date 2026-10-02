import {
  CONTRACT_TYPES,
  REMOTE_TYPES,
  parseContractType,
  parseRemote,
  type ContractType,
  type JobSource,
  type RemoteType,
} from '@joblog/shared';
import { ObjectId } from 'mongodb';
import { getCollection } from '../../lib/db.js';
import { getEnv } from '../../lib/env.js';
import { normalizeLocationForStorage } from '../../lib/addresses.js';
import { getReminderDefaultDays } from '../../lib/notification-settings.js';
import { identifyJobPosting, isJobListUrl } from '../job-postings/url-identity.js';
import { BUILT_IN_EXTENSION_RECIPES } from './built-in-recipes.js';
import { extractCaptureWithGemini } from './gemini.js';
import { createManualHandoff } from './manual-handoffs.js';
import {
  extractWithRecipe,
  matchesRecipe,
  mergeRecipeExtractionResults,
  stripHtmlText,
} from './recipe-engine.js';
import {
  ExtensionRecipeInputSchema,
  type ExtensionSnapshot,
} from './schemas.js';

interface ExtractedCapture {
  title: string | null;
  company: string | null;
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
}

export async function captureExtensionPage(userId: string, snapshot: ExtensionSnapshot) {
  const builtInRecipe = BUILT_IN_EXTENSION_RECIPES.find((item) => matchesRecipe(item, snapshot.url)) ?? null;
  const recipe = await findRecipe(snapshot.url);
  const structured = extractStructured(snapshot);
  const recipeResult = mergeRecipeExtractionResults(
    recipe ? extractWithRecipe(snapshot, recipe) : null,
    builtInRecipe && builtInRecipe !== recipe
      ? extractWithRecipe(snapshot, builtInRecipe)
      : null,
  );
  const deterministic = mergeDeterministic(recipeResult?.fields ?? {}, structured.fields);
  const recipeNativeJobId = recipeResult?.nativeJobId && !/^https?:\/\//i.test(recipeResult.nativeJobId)
    ? recipeResult.nativeJobId
    : null;

  const hasStableIdentity = Boolean(recipeResult?.nativeJobId) || structured.jobPostingCount === 1;
  const needsGemini = !deterministic.title || !deterministic.company || !hasStableIdentity || structured.jobPostingCount > 1;
  const gemini = needsGemini ? await extractCaptureWithGemini(snapshot) : null;
  const geminiAccepted = Boolean(
    gemini?.isSingleJobPosting &&
    gemini.confidence >= 0.8 &&
    clean(gemini.title) &&
    clean(gemini.company),
  );
  const extracted = geminiAccepted ? mergeGemini(deterministic, gemini!) : deterministic;

  const source = recipe?.source ?? 'custom';
  const sourceKey = recipe?.recipeKey ?? new URL(snapshot.url).hostname.replace(/^www\./, '');
  const sourceLabel = recipe?.source === 'custom'
    ? recipe.sourceLabel ?? sourceKey
    : recipe?.sourceLabel ?? null;
  const nativeJobId = recipeNativeJobId;

  if (
    !extracted.title
    || !extracted.company
    || (needsGemini && !geminiAccepted)
    || (isJobListUrl(snapshot.url) && !recipeNativeJobId)
  ) {
    return createHandoffResponse(
      userId,
      snapshot,
      source,
      sourceKey,
      sourceLabel,
      nativeJobId,
      extracted,
    );
  }

  let identity;
  try {
    identity = identifyJobPosting({
      url: snapshot.url,
      canonicalUrl: trustedCanonicalUrl(snapshot),
      source,
      sourceKey,
      nativeJobId,
      title: extracted.title,
      company: extracted.company,
      location: extracted.location,
    });
  } catch {
    return createHandoffResponse(
      userId,
      snapshot,
      source,
      sourceKey,
      sourceLabel,
      nativeJobId,
      extracted,
    );
  }

  const now = new Date();
  const location = await normalizeLocationForStorage(extracted.location);
  const jobPostings = await getCollection('job_postings');
  const existing = await jobPostings.findOne({ userId, dedup_key: identity.dedupKey });
  const buildJobUpdates = (document: Record<string, unknown> | null) => {
    const writeAt = new Date();
    const manualFields = new Set(
      Array.isArray(document?.manual_fields)
        ? document.manual_fields.filter((field): field is string => typeof field === 'string')
        : [],
    );
    const mutableFields: Record<string, unknown> = {
      title: extracted.title,
      company: extracted.company,
      ...location,
      description: extracted.description,
      description_source: 'scrape',
      contract_type: extracted.contract_type,
      remote: extracted.remote,
      salary: extracted.salary,
      requirements: extracted.requirements,
      keywords: extracted.keywords,
    };
    for (const field of manualFields) delete mutableFields[field];
    if (manualFields.has('description')) delete mutableFields.description_source;
    if (manualFields.has('location')) {
      delete mutableFields.location_details;
      delete mutableFields.location_normalization_status;
      delete mutableFields.location_normalized_at;
    }
    return {
      ...mutableFields,
      url: identity.canonicalUrl,
      dedup_key: identity.dedupKey,
      dedup_version: 2,
      source: identity.source,
      source_key: identity.sourceKey,
      source_label: sourceLabel,
      native_job_id: identity.nativeJobId,
      scrape_method: geminiAccepted ? 'gemini' : 'extension',
      scraped_at: writeAt,
      scrape_status: 'succeeded',
      scrape_steps: [],
      scrape_error: null,
      scrape_error_code: null,
      scrape_error_category: null,
      scrape_message_id: null,
      scrape_started_at: null,
      scrape_finished_at: writeAt,
      updated_at: writeAt,
    };
  };

  const updateExistingJob = async (initial: NonNullable<typeof existing>) => {
    let current = initial;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const versionFilter = current.updated_at instanceof Date
        ? { updated_at: current.updated_at }
        : { updated_at: { $exists: false } };
      const result = await jobPostings.updateOne(
        {
          _id: current._id,
          userId,
          dedup_key: identity.dedupKey,
          ...versionFilter,
        },
        { $set: buildJobUpdates(current) },
      );
      if (result.matchedCount === 1) return;

      const latest = await jobPostings.findOne({
        _id: current._id,
        userId,
        dedup_key: identity.dedupKey,
      });
      if (!latest) throw new Error('Unable to reconcile extension job posting');
      current = latest;
    }
    throw new Error('Extension job posting changed too many times');
  };

  if (existing?._id) {
    await updateExistingJob(existing);
  } else {
    try {
      await jobPostings.insertOne({
        _id: new ObjectId(),
        userId,
        ...buildJobUpdates(null),
        scrape_attempts: 0,
        created_at: now,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const raced = await jobPostings.findOne({ userId, dedup_key: identity.dedupKey });
      if (!raced?._id) throw error;
      await updateExistingJob(raced);
    }
  }
  const savedJobPosting = await jobPostings.findOne({ userId, dedup_key: identity.dedupKey });
  if (!savedJobPosting?._id) throw new Error('Unable to persist extension job posting');
  const jobPostingId = savedJobPosting._id;

  const applications = await getCollection('applications');
  const previousApplication = await applications.findOne({
    userId,
    jobPostingId: jobPostingId.toString(),
  });
  const proposedApplicationId = previousApplication?._id ?? new ObjectId();
  const frequencyDays = await getReminderDefaultDays(userId);
  let applicationCreated = false;
  try {
    const result = await applications.updateOne(
      { userId, jobPostingId: jobPostingId.toString() },
      {
        $setOnInsert: {
          _id: proposedApplicationId,
          userId,
          jobPostingId: jobPostingId.toString(),
          cvId: null,
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
        },
      },
      { upsert: true },
    );
    applicationCreated = result.upsertedCount === 1;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  const application = await applications.findOne({ userId, jobPostingId: jobPostingId.toString() });
  if (!application?._id) throw new Error('Unable to persist extension application');
  const applicationId = application._id;

  const duplicate = !applicationCreated;
  console.info('[extension-capture]', {
    source: identity.source,
    recipeVersion: recipe?.version ?? null,
    method: geminiAccepted ? 'gemini' : 'deterministic',
    snapshotBytes: Buffer.byteLength(snapshot.html, 'utf8'),
    outcome: duplicate ? 'already_exists' : 'saved',
  });

  return {
    status: duplicate ? 'already_exists' as const : 'saved' as const,
    applicationId: applicationId.toString(),
    duplicate,
    message: duplicate ? 'Cette offre est déjà dans JobLog.' : 'Offre sauvegardée.',
  };
}

async function createHandoffResponse(
  userId: string,
  snapshot: ExtensionSnapshot,
  source: JobSource,
  sourceKey: string,
  sourceLabel: string | null,
  nativeJobId: string | null,
  extracted: ExtractedCapture,
) {
  const handoff = await createManualHandoff(userId, {
    url: trustedCanonicalUrl(snapshot) ?? snapshot.url,
    source,
    source_key: sourceKey,
    source_label: sourceLabel,
    native_job_id: nativeJobId,
    ...extracted,
  });
  const appUrl = getEnv('PUBLIC_APP_URL') ?? 'https://joblog.arthurjenck.com';
  const url = new URL('/', appUrl);
  url.searchParams.set('add', '1');
  url.searchParams.set('handoff', handoff.token);

  console.info('[extension-capture]', {
    source,
    snapshotBytes: Buffer.byteLength(snapshot.html, 'utf8'),
    outcome: 'manual_required',
  });

  return {
    status: 'manual_required' as const,
    handoffUrl: url.toString(),
    duplicate: false,
    message: 'Certaines informations doivent être vérifiées manuellement.',
  };
}

async function findRecipe(rawUrl: string) {
  try {
    const documents = await (await getCollection('extension_recipes')).find({ enabled: true }).toArray();
    for (const document of documents) {
      const parsed = ExtensionRecipeInputSchema.safeParse({
        recipeKey: document.recipeKey,
        source: document.source,
        sourceLabel: document.sourceLabel ?? null,
        enabled: document.enabled,
        hostnames: document.hostnames,
        pathRules: document.pathRules ?? [],
        parameterRules: document.parameterRules ?? [],
        identityRules: document.identityRules,
        extractors: document.extractors,
        version: document.version,
      });
      if (parsed.success && matchesRecipe(parsed.data, rawUrl)) return parsed.data;
    }
  } catch {
    return BUILT_IN_EXTENSION_RECIPES.find((recipe) => matchesRecipe(recipe, rawUrl)) ?? null;
  }
  return BUILT_IN_EXTENSION_RECIPES.find((recipe) => matchesRecipe(recipe, rawUrl)) ?? null;
}

function extractStructured(snapshot: ExtensionSnapshot) {
  const postings = collectJobPostings(snapshot.jsonLd);
  const posting = postings[0] ?? null;
  const description = clean(readPath(posting, ['description']))
    ?? clean(snapshot.metadata.description)
    ?? clean(snapshot.metadata.openGraph['og:description']);
  const fallbackTitle = clean(snapshot.metadata.openGraph['og:title']);

  return {
    jobPostingCount: postings.length,
    fields: {
      title: clean(readPath(posting, ['title'])) ?? clean(readPath(posting, ['name'])) ?? fallbackTitle,
      company: clean(readPath(posting, ['hiringOrganization', 'name']))
        ?? clean(readPath(posting, ['organization', 'name'])),
      location: clean(readPath(posting, ['jobLocation', 'address', 'addressLocality']))
        ?? clean(readPath(posting, ['jobLocation', 'address', 'addressRegion'])),
      description: description ? stripHtml(description).slice(0, 10_000) : null,
      contract_type: parseContractType(clean(readPath(posting, ['employmentType'])) ?? ''),
      remote: parseRemote([description, clean(readPath(posting, ['jobLocationType']))].filter(Boolean).join(' ')),
      salary: null,
      requirements: stringArray(readPath(posting, ['skills'])),
      keywords: stringArray(readPath(posting, ['keywords'])),
    } satisfies ExtractedCapture,
  };
}

function mergeDeterministic(
  recipeFields: Record<string, string | null>,
  structured: ExtractedCapture,
): ExtractedCapture {
  const contract = clean(recipeFields.contract_type);
  const remote = clean(recipeFields.remote);
  return {
    ...structured,
    title: clean(recipeFields.title) ?? structured.title,
    company: clean(recipeFields.company) ?? structured.company,
    location: clean(recipeFields.location) ?? structured.location,
    description: clean(recipeFields.description)?.slice(0, 10_000) ?? structured.description,
    contract_type: contract && (CONTRACT_TYPES as readonly string[]).includes(contract)
      ? contract as ContractType
      : structured.contract_type,
    remote: remote && (REMOTE_TYPES as readonly string[]).includes(remote)
      ? remote as RemoteType
      : structured.remote,
  };
}

function mergeGemini(deterministic: ExtractedCapture, gemini: NonNullable<Awaited<ReturnType<typeof extractCaptureWithGemini>>>) {
  const contract = clean(gemini.contract_type);
  const remote = clean(gemini.remote);
  return {
    title: deterministic.title ?? clean(gemini.title),
    company: deterministic.company ?? clean(gemini.company),
    location: deterministic.location ?? clean(gemini.location),
    description: deterministic.description ?? clean(gemini.description)?.slice(0, 10_000) ?? null,
    contract_type: deterministic.contract_type
      ?? (contract && (CONTRACT_TYPES as readonly string[]).includes(contract) ? contract as ContractType : null),
    remote: deterministic.remote
      ?? (remote && (REMOTE_TYPES as readonly string[]).includes(remote) ? remote as RemoteType : null),
    salary: deterministic.salary ?? gemini.salary,
    requirements: deterministic.requirements ?? gemini.requirements,
    keywords: deterministic.keywords ?? gemini.keywords,
  } satisfies ExtractedCapture;
}

function collectJobPostings(values: unknown[]) {
  const postings: Array<Record<string, unknown>> = [];
  const queue = [...values];
  while (queue.length > 0) {
    const value = queue.shift();
    if (Array.isArray(value)) {
      queue.push(...value);
      continue;
    }
    if (!value || typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
    if (types.some((type) => String(type).toLowerCase() === 'jobposting')) postings.push(record);
    queue.push(...Object.values(record));
  }
  return postings;
}

function readPath(value: unknown, path: string[]) {
  let current = value;
  for (const segment of path) {
    if (Array.isArray(current)) current = current[0];
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function clean(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  return String(value).replace(/\s+/g, ' ').trim() || null;
}

function stringArray(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;|]/) : [];
  const normalized = values.map(clean).filter((item): item is string => Boolean(item));
  return normalized.length > 0 ? [...new Set(normalized)].slice(0, 20) : null;
}

function stripHtml(value: string) {
  return stripHtmlText(value);
}

function trustedCanonicalUrl(snapshot: ExtensionSnapshot) {
  if (!snapshot.canonicalUrl) return null;
  try {
    const page = new URL(snapshot.url);
    const canonical = new URL(snapshot.canonicalUrl);
    if (canonical.protocol !== 'https:') return null;
    const sameHost = canonical.hostname === page.hostname;
    const sameParent = canonical.hostname.endsWith(`.${page.hostname}`)
      || page.hostname.endsWith(`.${canonical.hostname}`);
    return sameHost || sameParent ? canonical.toString() : null;
  } catch {
    return null;
  }
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}
