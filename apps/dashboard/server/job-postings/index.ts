import { JOB_SOURCES, CONTRACT_TYPES, REMOTE_TYPES, SCRAPE_METHODS } from '@joblog/shared';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { sha256 } from '../../lib/hash.js';
import { normalizeLocationForStorage } from '../../lib/addresses.js';
import { isBlockedOrErrorJobPosting } from './scrape/content-filters.js';

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

export default defineHandler({
  POST: method({
    body: CreateJobPostingSchema,
    async handle({ user, body: data }) {
      const url_hash = sha256(data.url);
      const userId = user.id;
      const col = await getCollection('job_postings');

      const existing = await col.findOne({ url_hash, userId });
      if (existing) {
        if (existing.scrape_status === 'failed' || isBlockedOrErrorJobPosting(existing)) {
          const now = new Date();
          const locationNormalization = await normalizeLocationForStorage(data.location ?? null);
          await col.updateOne(
            { _id: existing._id, userId },
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
                scrape_status: 'succeeded',
                scrape_steps: [],
                scrape_attempts: 0,
                scrape_error: null,
                scrape_message_id: null,
                scrape_started_at: null,
                scrape_finished_at: now,
                updated_at: now,
              },
            }
          );

          return {
            json: {
              jobPostingId: existing._id.toString(),
              cached: false,
              repaired: true,
            },
          };
        }

        return { json: { jobPostingId: existing._id.toString(), cached: true } };
      }

      const now = new Date();
      const locationNormalization = await normalizeLocationForStorage(data.location ?? null);
      const doc = {
        userId,
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
        scrape_status: 'succeeded',
        scrape_steps: [],
        scrape_attempts: 0,
        scrape_error: null,
        scrape_message_id: null,
        scrape_started_at: null,
        scrape_finished_at: now,
        created_at: now,
        updated_at: now,
      };

      const result = await col.insertOne(doc);
      return { status: 201, json: { jobPostingId: result.insertedId.toString(), cached: false } };
    },
  }),
});
