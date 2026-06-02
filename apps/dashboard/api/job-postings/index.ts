import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';
import { sha256 } from '../../lib/hash.js';
import { JOB_SOURCES, CONTRACT_TYPES, REMOTE_TYPES, SCRAPE_METHODS } from '@joblog/shared';

const CreateJobPostingSchema = z.object({
  url: z.string().url(),
  source: z.enum(JOB_SOURCES),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  contract_type: z.enum(CONTRACT_TYPES).nullable().optional(),
  remote: z.enum(REMOTE_TYPES).nullable().optional(),
  salary: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    currency: z.string().nullable(),
    period: z.enum(['month', 'year']).nullable(),
  }).nullable().optional(),
  requirements: z.array(z.string()).nullable().optional(),
  keywords: z.array(z.string()).nullable().optional(),
  company_website: z.string().nullable().optional(),
  scrape_method: z.enum(SCRAPE_METHODS).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method === 'POST') {
    const parsed = CreateJobPostingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const data = parsed.data;
    const url_hash = sha256(data.url);
    const col = await getCollection('job_postings');

    const existing = await col.findOne({ url_hash });
    if (existing) {
      return res.status(200).json({ jobPostingId: existing._id.toString(), cached: true });
    }

    const now = new Date();
    const doc = {
      url: data.url,
      url_hash,
      source: data.source,
      title: data.title,
      company: data.company,
      location: data.location ?? null,
      description: data.description ?? null,
      contract_type: data.contract_type ?? null,
      remote: data.remote ?? null,
      salary: data.salary ?? null,
      requirements: data.requirements ?? null,
      keywords: data.keywords ?? null,
      company_website: data.company_website ?? null,
      scrape_method: data.scrape_method ?? 'manual',
      scraped_at: now,
      created_at: now,
      updated_at: now,
    };

    const result = await col.insertOne(doc);
    return res.status(201).json({ jobPostingId: result.insertedId.toString(), cached: false });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
