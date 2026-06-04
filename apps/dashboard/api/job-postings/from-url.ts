import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { getEnv } from '../../lib/env.js';
import { requireSession } from '../../lib/session.js';
import { sha256 } from '../../lib/hash.js';
import { GEMINI_DAILY_QUOTA, GEMINI_SCRAPE_RESERVE, GEMINI_MODEL } from '@joblog/shared';

const Schema = z.object({ url: z.string().url() });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session) return;

  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { url } = parsed.data;
  const url_hash = sha256(url);
  const col = await getCollection('job_postings');

  const cached = await col.findOne({ url_hash });
  if (cached) {
    if (isBlockedOrErrorPage({
      title: String(cached.title ?? ''),
      company: String(cached.company ?? ''),
      html: String(cached.description ?? ''),
      status: null,
    })) {
      return res.status(422).json({ error: blockedScrapeMessage(url) });
    }

    return res.status(200).json({ ...cached, _id: cached._id.toString(), cached: true });
  }

  let html: string;
  try {
    const fetchRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobLog/1.0)' },
      signal: AbortSignal.timeout(10_000),
    });
    html = await fetchRes.text();
    if (isBlockedOrErrorPage({ title: '', company: '', html, status: fetchRes.status })) {
      return res.status(422).json({ error: blockedScrapeMessage(url) });
    }
  } catch {
    return res.status(422).json({ error: 'Impossible de récupérer l\'URL' });
  }

  const extracted = extractWithCheerio(html);
  const incomplete = !extracted.title || !extracted.company;

  let scrape_method: 'cheerio' | 'gemini' | 'manual' = 'cheerio';

  if (incomplete) {
    const quotaOk = await checkGeminiQuota();
    if (quotaOk) {
      const geminiResult = await extractWithGemini(html, url);
      if (geminiResult) {
        Object.assign(extracted, geminiResult);
        scrape_method = 'gemini';
      }
    }
  }

  if (!extracted.title && !extracted.company) {
    scrape_method = 'manual';
  }

  const source = detectSource(url);
  const now = new Date();
  const doc = {
    url,
    url_hash,
    source,
    title: extracted.title ?? '',
    company: extracted.company ?? '',
    location: extracted.location ?? null,
    description: extracted.description ?? null,
    contract_type: null,
    remote: null,
    salary: null,
    requirements: null,
    keywords: null,
    company_website: extracted.company_website ?? null,
    scrape_method,
    scraped_at: now,
    created_at: now,
    updated_at: now,
  };

  const result = await col.insertOne(doc);
  return res.status(201).json({ ...doc, _id: result.insertedId.toString(), cached: false });
}

function extractWithCheerio(html: string) {
  const $ = cheerio.load(html);

  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim();
  const ogDesc = $('meta[property="og:description"]').attr('content')?.trim();
  const h1 = $('h1').first().text().trim();
  const title = ogTitle ?? h1 ?? '';

  let company = '';
  const ogSiteName = $('meta[property="og:site_name"]').attr('content')?.trim();
  const companySelectors = [
    '[class*="company"]', '[class*="employer"]', '[class*="organization"]',
    '[itemprop="hiringOrganization"] [itemprop="name"]',
  ];
  for (const sel of companySelectors) {
    const text = $(sel).first().text().trim();
    if (text && text.length < 100) { company = text; break; }
  }
  if (!company && ogSiteName) company = ogSiteName;

  const locationSelectors = [
    '[class*="location"]', '[class*="city"]', '[itemprop="addressLocality"]',
    '[class*="address"]',
  ];
  let location: string | null = null;
  for (const sel of locationSelectors) {
    const text = $(sel).first().text().trim();
    if (text && text.length < 100) { location = text; break; }
  }

  const description = ogDesc ?? $('main').first().text().trim().slice(0, 5000) ?? null;
  const company_website = extractCompanyWebsite($, company);

  return { title, company, location, description, company_website };
}

function extractCompanyWebsite($: cheerio.CheerioAPI, company: string) {
  return extractStructuredCompanyWebsite($) ?? extractLinkedCompanyWebsite($, company);
}

function extractStructuredCompanyWebsite($: cheerio.CheerioAPI) {
  const candidates: string[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;

    try {
      collectJsonLdUrls(JSON.parse(raw), candidates);
    } catch {
      return;
    }
  });

  for (const candidate of candidates) {
    const domain = normalizeCompanyDomain(candidate);
    if (domain) return domain;
  }

  return null;
}

function collectJsonLdUrls(value: unknown, candidates: string[]) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdUrls(item, candidates);
    return;
  }

  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  for (const key of ['hiringOrganization', 'organization', 'company', 'publisher', 'author', '@graph']) {
    collectJsonLdUrls(record[key], candidates);
  }

  for (const key of ['url', 'website', 'sameAs']) {
    const raw = record[key];
    if (typeof raw === 'string') candidates.push(raw);
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === 'string') candidates.push(item);
      }
    }
  }
}

function extractLinkedCompanyWebsite($: cheerio.CheerioAPI, company: string) {
  const normalizedCompany = normalizeText(company);
  const candidates: { domain: string; score: number }[] = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const domain = href ? normalizeCompanyDomain(href) : null;
    if (!domain) return;

    const text = normalizeText([
      $(el).text(),
      $(el).attr('aria-label'),
      $(el).attr('title'),
      href,
    ].filter(Boolean).join(' '));

    let score = 0;
    if (text.includes('site web') || text.includes('website') || text.includes('official')) score += 4;
    if (text.includes('site internet') || text.includes('visiter le site')) score += 4;
    if (normalizedCompany && domain.includes(normalizedCompany.replace(/\s+/g, ''))) score += 2;
    if (normalizedCompany && text.includes(normalizedCompany)) score += 1;
    if (text.includes('postuler') || text.includes('apply') || text.includes('candidater')) score -= 4;
    if (text.includes('job') || text.includes('career') || text.includes('emploi')) score -= 1;

    candidates.push({ domain, score });
  });

  candidates.sort((a, b) => b.score - a.score);

  const best = candidates.find((candidate) => candidate.score >= 2);
  return best?.domain ?? null;
}

function normalizeCompanyDomain(raw: string) {
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
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

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isBlockedOrErrorPage(input: {
  title: string;
  company: string;
  html: string;
  status: number | null;
}) {
  const text = `${input.title} ${input.company} ${input.html}`.toLowerCase();

  if (input.status !== null && input.status >= 400) return true;
  if (input.title.trim().toLowerCase() === '403 error') return true;
  if (text.includes('403 error')) return true;
  if (text.includes('not a robot')) return true;
  if (text.includes('verify that you\'re not a robot')) return true;
  if (text.includes('javascript is disabled')) return true;
  if (text.includes('enable javascript and then reload the page')) return true;

  return false;
}

function blockedScrapeMessage(url: string) {
  if (url.includes('welcometothejungle.com')) {
    return 'Welcome to the Jungle bloque la récupération depuis le dashboard. Ouvre l\'offre dans ton navigateur et sauvegarde-la via l\'extension.';
  }

  return 'Le site bloque la récupération automatique. Ouvre l\'offre dans ton navigateur et sauvegarde-la via l\'extension.';
}

async function extractWithGemini(html: string, url: string) {
  try {
    const model = getEnv('GEMINI_MODEL') ?? GEMINI_MODEL;
    const truncated = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    await incrementGeminiQuota();

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Extrait les informations suivantes de cette page d'offre d'emploi. Réponds en JSON strict avec les clés: title, company, location. Si une info est introuvable, utilise null.\nURL: ${url}\nContenu: """${truncated}"""`,
            }],
          }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!resp.ok) return null;
    const data = await resp.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return JSON.parse(text) as { title?: string; company?: string; location?: string };
  } catch {
    return null;
  }
}

async function checkGeminiQuota(): Promise<boolean> {
  const quotaCol = await getCollection('quota_usage');
  const today = new Date().toISOString().slice(0, 10);
  const usage = await quotaCol.findOne({ date: today });
  const calls = (usage?.calls as number) ?? 0;
  return calls + GEMINI_SCRAPE_RESERVE < GEMINI_DAILY_QUOTA;
}

async function incrementGeminiQuota() {
  const quotaCol = await getCollection('quota_usage');
  const today = new Date().toISOString().slice(0, 10);
  await quotaCol.updateOne(
    { date: today },
    { $inc: { calls: 1 }, $setOnInsert: { date: today } },
    { upsert: true }
  );
}

function detectSource(url: string) {
  if (url.includes('linkedin.com')) return 'linkedin' as const;
  if (url.includes('welcometothejungle.com')) return 'wttj' as const;
  if (url.includes('hellowork.com')) return 'hellowork' as const;
  if (url.includes('indeed.com')) return 'indeed' as const;
  if (url.includes('glassdoor.')) return 'glassdoor' as const;
  if (url.includes('jobteaser.com')) return 'jobteaser' as const;
  return 'paste' as const;
}
