import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';
import { sha256 } from '../../lib/hash.js';
import { normalizeLocationForStorage } from '../../lib/addresses.js';
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
      if (isBlockedOrErrorJobPosting(existing)) {
        const now = new Date();
        const locationNormalization = await normalizeLocationForStorage(data.location ?? null);
        await col.updateOne(
          { _id: existing._id },
          {
            $set: {
              source: data.source,
              title: data.title,
              company: data.company,
              ...locationNormalization,
              description: data.description ?? null,
              contract_type: data.contract_type ?? null,
              remote: data.remote ?? null,
              salary: data.salary ?? null,
              requirements: data.requirements ?? null,
              keywords: data.keywords ?? null,
              company_website: data.company_website ?? null,
              scrape_method: data.scrape_method ?? 'manual',
              scraped_at: now,
              updated_at: now,
            },
          }
        );

        return res.status(200).json({
          jobPostingId: existing._id.toString(),
          cached: false,
          repaired: true,
        });
      }

      return res.status(200).json({ jobPostingId: existing._id.toString(), cached: true });
    }

    const now = new Date();
    const locationNormalization = await normalizeLocationForStorage(data.location ?? null);
    const doc = {
      url: data.url,
      url_hash,
      source: data.source,
      title: data.title,
      company: data.company,
      ...locationNormalization,
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

function isBlockedOrErrorJobPosting(jobPosting: Record<string, unknown>) {
  const title = String(jobPosting.title ?? '').trim().toLowerCase();
  const company = String(jobPosting.company ?? '').trim();
  const description = String(jobPosting.description ?? '').toLowerCase();

  if (title === '403 error') return true;
  if (title.includes('403 error') && !company) return true;
  if (description.includes('not a robot')) return true;
  if (description.includes('javascript is disabled')) return true;

  return false;
}
