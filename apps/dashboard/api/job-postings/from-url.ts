import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
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
  if (cached) return res.status(200).json({ ...cached, _id: cached._id.toString(), cached: true });

  let html = '';
  try {
    const fetchRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobLog/1.0)' },
      signal: AbortSignal.timeout(10_000),
    });
    html = await fetchRes.text();
  } catch {
    return res.status(422).json({ error: 'Impossible de récupérer l\'URL' });
  }

  const extracted = extractWithCheerio(html, url);
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
    company_website: null,
    scrape_method,
    scraped_at: now,
    created_at: now,
    updated_at: now,
  };

  const result = await col.insertOne(doc);
  return res.status(201).json({ ...doc, _id: result.insertedId.toString(), cached: false });
}

function extractWithCheerio(html: string, url: string) {
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

  return { title, company, location, description };
}

async function extractWithGemini(html: string, url: string) {
  try {
    const truncated = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    await incrementGeminiQuota();

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
