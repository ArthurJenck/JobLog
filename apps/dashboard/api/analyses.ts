import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../lib/db.js';
import { requireSession } from '../lib/session.js';
import { GEMINI_DAILY_QUOTA, GEMINI_MODEL } from '@joblog/shared';

const Schema = z.object({
  cvId: z.string(),
  applicationId: z.string(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session) return;

  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { cvId, applicationId } = parsed.data;

  const [cvCol, appCol, analysesCol] = await Promise.all([
    getCollection('cvs'),
    getCollection('applications'),
    getCollection('cv_analyses'),
  ]);

  const [cv, app] = await Promise.all([
    cvCol.findOne({ _id: new ObjectId(cvId), userId: session.user.id }),
    appCol.findOne({ _id: new ObjectId(applicationId), userId: session.user.id }),
  ]);

  if (!cv) return res.status(404).json({ error: 'CV introuvable' });
  if (!app) return res.status(404).json({ error: 'Candidature introuvable' });

  const cvHash = cv.content_hash as string;
  const jobPostingId = String(app.jobPostingId);

  const cached = await analysesCol.findOne({ cvHash, jobPostingId });
  if (cached) {
    return res.status(200).json({
      keywords_matched: cached.keywords_matched,
      keywords_missing: cached.keywords_missing,
      insights: cached.insights,
      cached: true,
    });
  }

  const withinQuota = await checkAndIncrementQuota();
  if (!withinQuota) {
    return res.status(503).json({
      code: 'service_unavailable',
      error: "Service d'analyse temporairement indisponible, réessayez demain",
    });
  }

  const jpCol = await getCollection('job_postings');
  const jp = await jpCol.findOne({ _id: new ObjectId(jobPostingId) });
  if (!jp) return res.status(404).json({ error: 'Offre introuvable' });

  const result = await callGemini(cv.content as string, jp.description as string ?? jp.title as string);
  if (!result) {
    return res.status(503).json({
      code: 'service_unavailable',
      error: "Service d'analyse temporairement indisponible, réessayez demain",
    });
  }

  await analysesCol.insertOne({
    cvHash,
    jobPostingId,
    keywords_matched: result.keywords_matched,
    keywords_missing: result.keywords_missing,
    insights: result.insights,
    generated_at: new Date(),
  });

  return res.status(200).json({ ...result, cached: false });
}

async function checkAndIncrementQuota(): Promise<boolean> {
  const col = await getCollection('quota_usage');
  const today = new Date().toISOString().slice(0, 10);

  const result = await col.findOneAndUpdate(
    { date: today, calls: { $lt: GEMINI_DAILY_QUOTA } },
    { $inc: { calls: 1 }, $setOnInsert: { date: today } },
    { upsert: true, returnDocument: 'after' }
  );

  return result !== null;
}

async function callGemini(cvText: string, jobDescription: string) {
  const prompt = `Tu es un assistant de recrutement. Compare ce CV à cette offre.
Réponds en JSON strict :
{
  "keywords_matched": [...],
  "keywords_missing": [...],
  "insights": "..."
}
keywords_matched : skills/technos de l'offre présents dans le CV (tableau de strings).
keywords_missing : skills/technos de l'offre absents du CV (tableau de strings).
insights : 3-5 lignes max, conseils concrets, en français.

CV: """${cvText.slice(0, 6000)}"""
Offre: """${jobDescription.slice(0, 4000)}"""`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(20_000),
      }
    );

    if (!resp.ok) return null;
    const data = await resp.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as {
      keywords_matched: string[];
      keywords_missing: string[];
      insights: string;
    };

    if (!Array.isArray(parsed.keywords_matched) || !Array.isArray(parsed.keywords_missing)) return null;
    return parsed;
  } catch {
    return null;
  }
}
