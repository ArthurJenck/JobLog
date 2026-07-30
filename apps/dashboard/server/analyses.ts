import { GEMINI_MODEL } from '@joblog/shared';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../lib/db.js';
import { getEnv } from '../lib/env.js';
import { sha256 } from '../lib/hash.js';
import { defineHandler, method } from '../lib/http/define-handler.js';
import { ApiError } from '../lib/http/errors.js';
import { checkAndIncrementQuota, getUserDailyQuota } from './usage/gemini-quota.js';

const Schema = z.object({
  cvId: z.string(),
  applicationId: z.string(),
  force: z.boolean().optional().default(false),
  jobDescription: z.string().max(20_000).optional(),
});

const LookupSchema = Schema.pick({ cvId: true, applicationId: true });

const ANALYSIS_PROMPT_VERSION = 'requirements-evidence-v1.1';
const MIN_COMPARISON_TEXT_LENGTH = 40;

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

function getGeminiModel() {
  return getEnv('GEMINI_MODEL') ?? GEMINI_MODEL;
}

function isAdmin(email: string | undefined) {
  const admin = (getEnv('ADMIN_MAIL') ?? '').replace(/^mailto:/, '').trim().toLowerCase();
  return !!admin && !!email && email.trim().toLowerCase() === admin;
}

function normalizeComparisonText(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim()
    : '';
}

function hasComparableJobText(value: string) {
  return value.length >= MIN_COMPARISON_TEXT_LENGTH;
}

type GeminiCallResult =
  | { ok: true; result: AnalysisResult }
  | { ok: false; reason: 'provider_http' | 'network' | 'provider_empty' | 'invalid_json' | 'normalize_empty'; status?: number };

async function callGemini(cvText: string, jobDescription: string, model: string): Promise<GeminiCallResult> {
  const prompt = `You are a recruiting assistant. Compare this CV against this job posting.
Respond in strict JSON:
{
  "requirements": [
    {
      "keyword": "...",
      "present": true,
      "evidence": "short exact excerpt from the CV"
    }
  ],
  "insights": "..."
}

Rules:
- requirements: 5 to 12 important skills/technologies from the posting.
- requirements must only contain skills, technologies, frameworks, languages, tools, or methods requested by the posting; not job titles, seniority, vague soft skills, or marketing phrasing.
- present=true only if the skill is explicitly present in the CV, or if a tool/technology mentioned in the CV implies it with near-certainty (the confidence level a recruiter would accept without argument, e.g. a relational database engine implies SQL, a framework implies its base language).
- Never make this connection based on mere thematic proximity, popularity, or a "neighboring" but unguaranteed skill (e.g. do not infer Kubernetes from Docker, GraphQL from REST, or Vue from React); when in doubt, present=false.
- Never infer a skill from the job posting or the job title.
- For technologies/frameworks/languages/tools, require the exact term, an obvious typographic variant, or the near-certain implication described above in the CV.
- evidence must be a short exact excerpt from the CV when present=true (the excerpt that justifies the direct presence or the implication), otherwise null.
- If you cannot find an exact excerpt from the CV for evidence, present must be false.
- If a skill seems implicit/logical but is not written in the CV and is not near-certainly implied by a mentioned tool either, present must be false; mention in insights that it should be added explicitly if true.
- Check consistency before answering: every present=true item must have non-null evidence, every absent item must have present=false and evidence=null.
- insights must be consistent with requirements: never say a skill is absent if present=true.
- insights: 3-5 lines max, concrete advice, written in French.

CV: """${cvText.slice(0, 6000)}"""
Job posting: """${jobDescription.slice(0, 4000)}"""`;

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

    if (!resp.ok) return { ok: false, reason: 'provider_http', status: resp.status };
    const data = await resp.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false, reason: 'provider_empty' };

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'invalid_json' };
    }

    const result = normalizeAnalysisResult(parsed);
    if (!result) return { ok: false, reason: 'normalize_empty' };

    return { ok: true, result };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

function normalizeAnalysisResult(raw: unknown): AnalysisResult | null {
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
    const present = requestedPresent && evidence !== null;
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

async function loadCvAndApplication(userId: string, cvId: string, applicationId: string) {
  if (!ObjectId.isValid(cvId) || !ObjectId.isValid(applicationId)) {
    throw ApiError.badRequest('Invalid id');
  }

  const [cvCol, appCol] = await Promise.all([
    getCollection('cvs'),
    getCollection('applications'),
  ]);

  const [cv, app] = await Promise.all([
    cvCol.findOne({ _id: new ObjectId(cvId), userId }),
    appCol.findOne({ _id: new ObjectId(applicationId), userId }),
  ]);

  if (!cv) throw ApiError.notFound('CV introuvable');
  if (!app) throw ApiError.notFound('Candidature introuvable');

  const jobPostingId = String(app.jobPostingId);
  if (!ObjectId.isValid(jobPostingId)) throw ApiError.badRequest('Invalid job posting id');

  const jpCol = await getCollection('job_postings');
  const jp = await jpCol.findOne({ _id: new ObjectId(jobPostingId), userId });
  if (!jp) throw ApiError.notFound('Offre introuvable');

  return { cv, app, jp, jpCol, jobPostingId };
}

export default defineHandler({
  GET: method({
    query: LookupSchema,
    async handle({ user, query }) {
      const { cv, jp } = await loadCvAndApplication(user.id, query.cvId, query.applicationId);

      const cvHash = cv.content_hash as string;
      const jobPostingId = String(jp._id);
      const model = getGeminiModel();
      const comparisonText = normalizeComparisonText(jp.description);

      if (!hasComparableJobText(comparisonText)) {
        throw new ApiError(422, 'no_comparison_data', 'Aucune donnée à comparer avec votre CV. Collez le texte de l’offre pour lancer l’analyse.');
      }

      const jobDescriptionHash = sha256(comparisonText);

      const analysesCol = await getCollection('cv_analyses');
      const cached = await analysesCol.findOne({
        userId: user.id,
        cvHash,
        jobPostingId,
        jobDescriptionHash,
        model,
        analysisVersion: ANALYSIS_PROMPT_VERSION,
      });

      if (!cached) return { json: { analysis: null } };

      return {
        json: {
          analysis: {
            keywords_matched: cached.keywords_matched,
            keywords_missing: cached.keywords_missing,
            requirements: cached.requirements ?? [],
            insights: cached.insights,
            cached: true,
          },
        },
      };
    },
  }),
  POST: method({
    body: Schema,
    async handle({ user, body }) {
      const { cvId, applicationId, force, jobDescription } = body;
      const { cv, jp, jpCol } = await loadCvAndApplication(user.id, cvId, applicationId);

      const cvHash = cv.content_hash as string;
      const jobPostingId = String(jp._id);
      const model = getGeminiModel();

      const jobDescriptionOverride = jobDescription !== undefined ? normalizeComparisonText(jobDescription) : '';
      const storedJobDescription = normalizeComparisonText(jp.description);
      const comparisonText = jobDescriptionOverride || storedJobDescription;

      if (!hasComparableJobText(comparisonText)) {
        throw new ApiError(422, 'no_comparison_data', 'Aucune donnée à comparer avec votre CV. Collez le texte de l’offre pour lancer l’analyse.');
      }

      if (jobDescriptionOverride && !hasComparableJobText(storedJobDescription)) {
        const now = new Date();
        await jpCol.updateOne(
          { _id: jp._id, userId: user.id },
          {
            $set: {
              description: jobDescriptionOverride,
              description_source: 'manual',
              scrape_status: 'succeeded',
              scrape_error: null,
              scrape_error_code: null,
              scrape_error_category: null,
              scrape_finished_at: now,
              updated_at: now,
            },
          },
        );
      }

      const jobDescriptionHash = sha256(comparisonText);
      const analysesCol = await getCollection('cv_analyses');

      const cached = !force ? await analysesCol.findOne({
        userId: user.id,
        cvHash,
        jobPostingId,
        jobDescriptionHash,
        model,
        analysisVersion: ANALYSIS_PROMPT_VERSION,
      }) : null;
      if (cached) {
        return {
          json: {
            keywords_matched: cached.keywords_matched,
            keywords_missing: cached.keywords_missing,
            requirements: cached.requirements ?? [],
            insights: cached.insights,
            cached: true,
          },
        };
      }

      if (!isAdmin(user.email)) {
        const quotaCheck = await checkAndIncrementQuota(user.id);
        if (quotaCheck === 'user_limit') {
          throw new ApiError(429, 'quota_exceeded', `Tu as atteint ta limite quotidienne de ${getUserDailyQuota()} analyses, réessaie demain.`);
        }
        if (quotaCheck === 'global_limit') {
          throw new ApiError(429, 'quota_exceeded', "Quota d'analyse atteint pour aujourd'hui, réessayez demain.");
        }
      }

      const geminiResult = await callGemini(cv.content as string, comparisonText, model);
      if (!geminiResult.ok) {
        if (geminiResult.reason === 'provider_http' && geminiResult.status === 429) {
          throw new ApiError(429, 'quota_exceeded', "Quota d'analyse atteint, réessayez demain.");
        }
        if (geminiResult.reason === 'provider_http' || geminiResult.reason === 'network') {
          throw new ApiError(503, 'analysis_unavailable', "Service d'analyse temporairement indisponible, réessayez plus tard.");
        }
        throw new ApiError(502, 'analysis_failed', "L'analyse n'a pas pu être produite, réessayez.");
      }
      const result = geminiResult.result;

      await analysesCol.updateOne(
        { userId: user.id, cvHash, jobPostingId },
        {
          $set: {
            userId: user.id,
            cvHash,
            jobPostingId,
            jobDescriptionHash,
            jobDescriptionSource: jobDescriptionOverride ? 'manual_input' : 'job_posting',
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

      return { json: { ...result, cached: false } };
    },
  }),
});
