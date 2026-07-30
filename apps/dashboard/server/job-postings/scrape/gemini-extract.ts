import { GEMINI_MODEL } from '@joblog/shared';
import { z } from 'zod';
import { getEnv } from '../../../lib/env.js';
import { type NormalizedExtraction, normalizeGeminiExtraction, normalizeWhitespace } from './normalize.js';

const MAX_MARKDOWN_CHARS_FOR_GEMINI = 18_000;

const SalarySchema = z.object({
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  period: z.enum(['month', 'year']).nullable().optional(),
}).nullable().optional();

export const GeminiExtractionSchema = z.object({
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

export type GeminiExtraction = z.infer<typeof GeminiExtractionSchema>;

export async function extractWithGemini(
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
