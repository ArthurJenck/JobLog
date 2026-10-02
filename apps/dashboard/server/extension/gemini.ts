import { GEMINI_MODEL } from '@joblog/shared';
import { z } from 'zod';
import { getEnv } from '../../lib/env.js';
import { checkAndIncrementGeminiQuota } from '../usage/gemini-quota.js';
import type { ExtensionSnapshot } from './schemas.js';

const GeminiCaptureSchema = z.object({
  isSingleJobPosting: z.boolean(),
  confidence: z.number().min(0).max(1),
  title: z.string().nullable(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  contract_type: z.string().nullable(),
  remote: z.string().nullable(),
  salary: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    currency: z.string().nullable(),
    period: z.enum(['month', 'year']).nullable(),
  }).nullable(),
  requirements: z.array(z.string()).nullable(),
  keywords: z.array(z.string()).nullable(),
}).strict();

export type GeminiCapture = z.infer<typeof GeminiCaptureSchema>;

export async function extractCaptureWithGemini(snapshot: ExtensionSnapshot) {
  const apiKey = getEnv('GEMINI_API_KEY');
  if (!apiKey || !(await checkAndIncrementGeminiQuota())) return null;

  const model = getEnv('GEMINI_MODEL') ?? GEMINI_MODEL;
  const content = snapshot.html.replace(/\s+/g, ' ').trim().slice(0, 20_000);
  const prompt = `Analyse cet extrait HTML nettoyé et détermine s'il représente une seule offre d'emploi active.
Réponds uniquement en JSON strict avec les clés suivantes :
{
  "isSingleJobPosting": boolean,
  "confidence": number,
  "title": string | null,
  "company": string | null,
  "location": string | null,
  "description": string | null,
  "contract_type": string | null,
  "remote": string | null,
  "salary": { "min": number | null, "max": number | null, "currency": string | null, "period": "month" | "year" | null } | null,
  "requirements": string[] | null,
  "keywords": string[] | null
}
N'invente aucune information. Une page de résultats sans offre active ou contenant plusieurs offres mélangées doit avoir isSingleJobPosting=false. La confiance doit refléter l'ambiguïté réelle.
URL: ${snapshot.url}
Titre du document: ${snapshot.title}
HTML nettoyé: ${content}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) return null;

    const body = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = GeminiCaptureSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
