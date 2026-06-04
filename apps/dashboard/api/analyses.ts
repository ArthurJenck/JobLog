import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../lib/db.js';
import { getEnv } from '../lib/env.js';
import { requireSession } from '../lib/session.js';
import { GEMINI_DAILY_QUOTA, GEMINI_MODEL } from '@joblog/shared';

const Schema = z.object({
  cvId: z.string(),
  applicationId: z.string(),
  force: z.boolean().optional().default(false),
});

const ANALYSIS_PROMPT_VERSION = 'requirements-evidence-v1';

interface RequirementAnalysis {
  keyword: string;
  present: boolean;
  evidence: string | null;
}

interface AnalysisResult {
  keywords_matched: string[];
  keywords_missing: string[];
  requirements: RequirementAnalysis[];
  insights: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session) return;

  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { cvId, applicationId, force } = parsed.data;

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
  const model = getGeminiModel();

  const cached = force ? null : await analysesCol.findOne({
    cvHash,
    jobPostingId,
    model,
    analysisVersion: ANALYSIS_PROMPT_VERSION,
  });
  if (cached) {
    return res.status(200).json({
      keywords_matched: cached.keywords_matched,
      keywords_missing: cached.keywords_missing,
      requirements: cached.requirements ?? [],
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

  const result = await callGemini(cv.content as string, String(jp.description ?? jp.title ?? ''), model);
  if (!result) {
    return res.status(503).json({
      code: 'service_unavailable',
      error: "Service d'analyse temporairement indisponible, réessayez demain",
    });
  }

  await analysesCol.updateOne(
    { cvHash, jobPostingId },
    {
      $set: {
        cvHash,
        jobPostingId,
        model,
        analysisVersion: ANALYSIS_PROMPT_VERSION,
        keywords_matched: result.keywords_matched,
        keywords_missing: result.keywords_missing,
        requirements: result.requirements,
        insights: result.insights,
        generated_at: new Date(),
      },
    },
    { upsert: true }
  );

  return res.status(200).json({ ...result, cached: false });
}

function getGeminiModel() {
  return getEnv('GEMINI_MODEL') ?? GEMINI_MODEL;
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

async function callGemini(cvText: string, jobDescription: string, model: string): Promise<AnalysisResult | null> {
  const prompt = `Tu es un assistant de recrutement. Compare ce CV à cette offre.
Réponds en JSON strict :
{
  "requirements": [
    {
      "keyword": "...",
      "present": true,
      "evidence": "court extrait exact du CV"
    }
  ],
  "insights": "..."
}

Règles :
- requirements : 5 à 12 skills/technos importantes de l'offre.
- requirements doit contenir uniquement des compétences, technos, frameworks, langages, outils ou méthodes demandés par l'offre ; pas de titre de poste, séniorité, soft skill vague ou formulation marketing.
- present=true uniquement si la compétence est explicitement présente dans le CV.
- Ne déduis jamais une compétence depuis l'offre, le titre du poste, ou une compétence voisine.
- Pour les technologies/frameworks/langages/outils, exige le terme exact ou une variante typographique évidente dans le CV.
- evidence doit être un court extrait exact du CV quand present=true, sinon null.
- Si tu ne trouves pas d'extrait exact du CV pour evidence, present doit être false.
- Si une compétence semble implicite/logique mais n'est pas écrite dans le CV, present doit être false ; mentionne dans insights qu'il faut l'ajouter explicitement si c'est vrai.
- Vérifie la cohérence avant de répondre : tout item present=true doit avoir evidence non-null, tout item absent doit avoir present=false et evidence=null.
- Les insights doivent être cohérents avec requirements : ne dis jamais qu'une compétence est absente si present=true.
- insights : 3-5 lignes max, conseils concrets, en français.

CV: """${cvText.slice(0, 6000)}"""
Offre: """${jobDescription.slice(0, 4000)}"""`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
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

    return normalizeAnalysisResult(JSON.parse(text), cvText);
  } catch {
    return null;
  }
}

function normalizeAnalysisResult(raw: unknown, cvText: string): AnalysisResult | null {
  if (!raw || typeof raw !== 'object') return null;

  const parsed = raw as {
    requirements?: unknown;
    keywords_matched?: unknown;
    keywords_missing?: unknown;
    insights?: unknown;
  };

  const rawRequirements = Array.isArray(parsed.requirements)
    ? parsed.requirements
    : [
        ...toStringArray(parsed.keywords_matched).map((keyword) => ({ keyword, present: true, evidence: keyword })),
        ...toStringArray(parsed.keywords_missing).map((keyword) => ({ keyword, present: false, evidence: null })),
      ];

  const byKeyword = new Map<string, RequirementAnalysis>();
  let correctedByEvidence = false;

  for (const item of rawRequirements) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as { keyword?: unknown; present?: unknown; evidence?: unknown };
    if (typeof candidate.keyword !== 'string') continue;

    const keyword = candidate.keyword.trim();
    if (!keyword) continue;

    const evidence = typeof candidate.evidence === 'string' && candidate.evidence.trim()
      ? candidate.evidence.trim()
      : null;
    const requestedPresent = candidate.present === true;
    const present = requestedPresent
      && evidence !== null
      && containsNormalized(cvText, evidence)
      && keywordAppearsInText(keyword, cvText);
    correctedByEvidence ||= requestedPresent && !present;

    const key = normalizeCompactText(keyword);
    const current = byKeyword.get(key);
    if (!current || present) {
      byKeyword.set(key, { keyword, present, evidence: present ? evidence : null });
    }
  }

  const requirements = [...byKeyword.values()];
  if (!requirements.length) return null;

  return {
    keywords_matched: requirements.filter((item) => item.present).map((item) => item.keyword),
    keywords_missing: requirements.filter((item) => !item.present).map((item) => item.keyword),
    requirements,
    insights: correctedByEvidence
      ? buildEvidenceBasedInsights(requirements)
      : typeof parsed.insights === 'string' ? parsed.insights.trim() : buildEvidenceBasedInsights(requirements),
  };
}

function buildEvidenceBasedInsights(requirements: RequirementAnalysis[]) {
  const matched = requirements.filter((item) => item.present).map((item) => item.keyword);
  const missing = requirements.filter((item) => !item.present).map((item) => item.keyword);
  const lines: string[] = [];

  if (matched.length) {
    lines.push(`Le CV couvre clairement : ${matched.slice(0, 5).join(', ')}.`);
  }

  if (missing.length) {
    lines.push(`À ajouter ou expliciter pour cette offre : ${missing.slice(0, 6).join(', ')}.`);
    lines.push('Ajoute ces mots-clés ou des projets associés au CV uniquement si tu peux les justifier concrètement.');
  } else {
    lines.push('Le profil semble bien aligné avec les compétences clés de l’offre.');
  }

  return lines.join('\n');
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function keywordAppearsInText(keyword: string, text: string) {
  return containsNormalized(text, keyword);
}

function containsNormalized(text: string, search: string) {
  const haystack = normalizeText(text);
  const needle = normalizeText(search);
  if (needle.length <= 1) return false;

  if (` ${haystack} `.includes(` ${needle} `)) return true;

  const compactNeedle = normalizeCompactText(search);
  if (compactNeedle.length <= 1) return false;

  const words = haystack.split(' ').filter(Boolean);
  const needleWordCount = needle.split(' ').filter(Boolean).length;
  const maxWindowSize = Math.min(Math.max(needleWordCount + 1, 1), 8);

  for (let size = 1; size <= maxWindowSize; size += 1) {
    for (let index = 0; index + size <= words.length; index += 1) {
      if (words.slice(index, index + size).join('') === compactNeedle) return true;
    }
  }

  return false;
}

function normalizeText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompactText(value: string) {
  return normalizeText(value).replace(/\s+/g, '');
}
