import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { getEnv } from '../../lib/env.js';
import { sha256 } from '../../lib/hash.js';
import { requireSession } from '../../lib/session.js';
import {
  CONTRACT_TYPES,
  GEMINI_DAILY_QUOTA,
  GEMINI_MODEL,
  GEMINI_SCRAPE_RESERVE,
  REMOTE_TYPES,
  parseContractType,
  parseRemote,
  type ContractType,
  type RemoteType,
} from '@joblog/shared';

const RequestSchema = z.object({ url: z.string().url() });

const URL_USAGE_KIND = 'url_paste';
const URL_USAGE_WARNING_AT = 3;
const URL_USAGE_LIMIT = 5;
const JINA_ALERT_THRESHOLD_DEFAULT = 8_000_000;
const JINA_READER_URL = 'https://r.jina.ai/';
const MAX_MARKDOWN_CHARS_FOR_GEMINI = 18_000;
const MAX_DESCRIPTION_CHARS = 10_000;
const PARIS_TIME_ZONE = 'Europe/Paris';

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

type UrlUsage = {
  date: string;
  count: number;
  warningAt: number;
  limit: number;
  remaining: number;
  shouldWarn: boolean;
  isBlocked: boolean;
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
  url: string;
  url_hash: string;
  title?: unknown;
  company?: unknown;
  description?: unknown;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    return res.status(200).json({
      usage: await getUrlUsage(session.user.id),
      extensionUrl: getExtensionUrl(),
    });
  }

  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { url } = parsed.data;
  const url_hash = sha256(url);
  const col = await getCollection<JobPostingDoc>('job_postings');
  const cached = await col.findOne({ url_hash });
  const currentUsage = await getUrlUsage(session.user.id);

  if (cached) {
    if (isBlockedOrErrorContent({
      title: String(cached.title ?? ''),
      company: String(cached.company ?? ''),
      content: String(cached.description ?? ''),
      status: null,
    })) {
      return res.status(422).json({
        code: 'blocked_or_empty_cache',
        error: blockedScrapeMessage(url),
        usage: currentUsage,
        extensionUrl: getExtensionUrl(),
      });
    }

    return res.status(200).json({
      ...cached,
      _id: cached._id.toString(),
      cached: true,
      usage: currentUsage,
      extensionUrl: getExtensionUrl(),
    });
  }

  if (currentUsage.isBlocked) {
    return res.status(429).json({
      code: 'url_paste_limit_exceeded',
      error: "Limite d'ajout par URL atteinte pour aujourd'hui. Utilise l'extension pour continuer sans limite.",
      usage: currentUsage,
      extensionUrl: getExtensionUrl(),
    });
  }

  const jinaApiKey = getEnv('JINA_API_KEY');
  if (!jinaApiKey) {
    return res.status(503).json({
      code: 'jina_missing_api_key',
      error: 'Service de récupération temporairement indisponible.',
      usage: currentUsage,
      extensionUrl: getExtensionUrl(),
    });
  }

  const usageAfterIncrement = await incrementUrlUsage(session.user.id);
  if (!usageAfterIncrement) {
    const usage = await getUrlUsage(session.user.id);
    return res.status(429).json({
      code: 'url_paste_limit_exceeded',
      error: "Limite d'ajout par URL atteinte pour aujourd'hui. Utilise l'extension pour continuer sans limite.",
      usage,
      extensionUrl: getExtensionUrl(),
    });
  }

  const jinaResult = await fetchJinaMarkdown(url, jinaApiKey);
  await recordJinaUsage({
    apiKey: jinaApiKey,
    status: jinaResult.status,
    outputChars: jinaResult.markdown?.length ?? 0,
    errorCode: jinaResult.errorCode,
  });

  if (!jinaResult.ok) {
    const usageAfterRelease = await releaseUrlUsage(session.user.id);
    const status = jinaResult.errorCode === 'jina_auth_error' ||
      jinaResult.errorCode === 'jina_balance_error' ||
      jinaResult.errorCode === 'jina_rate_limited' ||
      jinaResult.errorCode === 'jina_unavailable' ||
      jinaResult.errorCode === 'jina_fetch_failed'
      ? 503
      : 422;

    return res.status(status).json({
      code: jinaResult.errorCode,
      error: status === 503
        ? 'Service de récupération temporairement indisponible.'
        : unreadableUrlMessage(url),
      providerStatus: jinaResult.status,
      usage: usageAfterRelease,
      extensionUrl: getExtensionUrl(),
    });
  }

  if (isBlockedOrErrorContent({
    title: '',
    company: '',
    content: jinaResult.markdown,
    status: jinaResult.status,
  })) {
    const usageAfterRelease = await releaseUrlUsage(session.user.id);
    return res.status(422).json({
      code: 'site_blocks_reader',
      error: blockedScrapeMessage(url),
      providerStatus: jinaResult.status,
      usage: usageAfterRelease,
      extensionUrl: getExtensionUrl(),
    });
  }

  const geminiApiKey = getEnv('GEMINI_API_KEY');
  if (!geminiApiKey) {
    const usageAfterRelease = await releaseUrlUsage(session.user.id);
    return res.status(503).json({
      code: 'gemini_missing_api_key',
      error: "Service d'analyse temporairement indisponible.",
      usage: usageAfterRelease,
      extensionUrl: getExtensionUrl(),
    });
  }

  const quotaOk = await checkAndIncrementGeminiQuota();
  if (!quotaOk) {
    const usageAfterRelease = await releaseUrlUsage(session.user.id);
    return res.status(429).json({
      code: 'gemini_quota_exceeded',
      error: "Quota d'analyse atteint, réessayez demain.",
      usage: usageAfterRelease,
      extensionUrl: getExtensionUrl(),
    });
  }

  const extraction = await extractWithGemini(jinaResult.markdown, url, geminiApiKey);
  if (!extraction) {
    const usageAfterRelease = await releaseUrlUsage(session.user.id);
    return res.status(422).json({
      code: 'gemini_extraction_failed',
      error: "Impossible d'extraire les informations principales de cette offre.",
      usage: usageAfterRelease,
      extensionUrl: getExtensionUrl(),
    });
  }

  const source = detectSource(url);
  const now = new Date();
  const doc = {
    url,
    url_hash,
    source,
    title: extraction.title,
    company: extraction.company,
    location: extraction.location,
    description: extraction.description,
    contract_type: extraction.contract_type,
    remote: extraction.remote,
    salary: extraction.salary,
    requirements: extraction.requirements,
    keywords: extraction.keywords,
    company_website: extraction.company_website,
    scrape_method: 'jina' as const,
    scraped_at: now,
    created_at: now,
    updated_at: now,
  };

  const result = await col.insertOne(doc);
  return res.status(201).json({
    ...doc,
    _id: result.insertedId.toString(),
    cached: false,
    usage: usageAfterIncrement,
    extensionUrl: getExtensionUrl(),
  });
}

async function fetchJinaMarkdown(url: string, apiKey: string): Promise<{
  ok: true;
  markdown: string;
  status: number;
  errorCode: null;
} | {
  ok: false;
  markdown: null;
  status: number | null;
  errorCode: string;
}> {
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
      };
    }

    return { ok: true, markdown: text, status: resp.status, errorCode: null };
  } catch {
    return {
      ok: false,
      markdown: null,
      status: null,
      errorCode: 'jina_fetch_failed',
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
  return `Extrait les informations principales de cette offre d'emploi depuis le markdown Jina ci-dessous.
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

  return "Impossible de lire cette URL automatiquement. Le site peut bloquer la récupération serveur, être indisponible, ou renvoyer une page que Jina ne peut pas convertir.";
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

function detectSource(url: string) {
  if (url.includes('linkedin.com')) return 'linkedin' as const;
  if (url.includes('welcometothejungle.com')) return 'wttj' as const;
  if (url.includes('hellowork.com')) return 'hellowork' as const;
  if (url.includes('indeed.com')) return 'indeed' as const;
  if (url.includes('glassdoor.')) return 'glassdoor' as const;
  if (url.includes('jobteaser.com')) return 'jobteaser' as const;
  if (url.includes('jobijoba.com')) return 'jobijoba' as const;
  if (url.includes('meteojob.com')) return 'meteojob' as const;
  if (url.includes('apec.fr')) return 'apec' as const;
  if (url.includes('francetravail.fr')) return 'francetravail' as const;
  if (url.includes('cadremploi.fr')) return 'cadremploi' as const;
  if (url.includes('talent.com')) return 'talent' as const;
  if (url.includes('lesjeudis.com')) return 'lesjeudis' as const;
  return 'paste' as const;
}
