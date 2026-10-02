import { JOB_SOURCES, CONTRACT_TYPES, REMOTE_TYPES, SCRAPE_METHODS } from '@joblog/shared';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { sha256 } from '../../lib/hash.js';
import { normalizeLocationForStorage } from '../../lib/addresses.js';
import { resolveJobPostingIdentity } from './url-identity.js';
import type { JobPostingDoc } from './scrape/store.js';
import { ApiError } from '../../lib/http/errors.js';
import {
  assertDedupMigrationWritesAllowed,
  MIGRATION_RETRY_AFTER_SECONDS,
  MigrationMaintenanceError,
} from '../migrations/maintenance.js';

const CreateJobPostingSchema = z.object({
  url: z.string().url(),
  source: z.enum(JOB_SOURCES),
  source_key: z.string().trim().min(1).optional(),
  source_label: z.string().trim().min(1).optional(),
  native_job_id: z.string().trim().min(1).optional(),
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
}).superRefine((value, context) => {
  if (value.source === 'custom' && !value.source_key) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['source_key'],
      message: 'source_key is required for a custom source',
    });
  }
});

export default defineHandler({
  POST: method({
    maintenanceSensitive: true,
    body: CreateJobPostingSchema,
    async handle({ user, body: data, res }) {
      try {
        await assertDedupMigrationWritesAllowed();
      } catch (error) {
        if (!(error instanceof MigrationMaintenanceError)) throw error;
        res.setHeader('Retry-After', String(MIGRATION_RETRY_AFTER_SECONDS));
        throw ApiError.serviceUnavailable(
          'Maintenance temporaire en cours. Réessaie dans quelques instants.',
          MIGRATION_RETRY_AFTER_SECONDS,
        );
      }
      const identity = resolveJobPostingIdentity({
        url: data.url,
        source: data.source === 'manual' && /^https?:/i.test(data.url)
          ? undefined
          : data.source,
        sourceKey: data.source_key,
        nativeJobId: data.native_job_id,
        title: data.title,
        company: data.company,
        location: data.location,
      });
      const userId = user.id;
      const col = await getCollection<JobPostingDoc>('job_postings');
      let existing = await col.findOne({ userId, dedup_key: identity.dedupKey });
      existing ??= await col.findOne({ userId, url_hash: sha256(data.url) });
      const now = new Date();
      const scrapeMethod = data.scrape_method ?? 'manual';
      const providedFields = await buildProvidedFields(data);
      const manualFields = [
        'title',
        'company',
        ...[
          'location',
          'description',
          'contract_type',
          'remote',
          'salary',
          'requirements',
          'keywords',
          'company_website',
        ].filter((field) => Object.prototype.hasOwnProperty.call(data, field)),
      ];

      if (existing?._id) {
        const nextManualFields = [
          ...new Set([
            ...(Array.isArray(existing.manual_fields) ? existing.manual_fields : []),
            ...manualFields,
          ]),
        ];
        const mutableFields: Record<string, unknown> = {
          title: data.title,
          company: data.company,
          ...providedFields,
        };
        if (scrapeMethod !== 'manual' && Array.isArray(existing.manual_fields)) {
          for (const field of existing.manual_fields) delete mutableFields[field];
          if (existing.manual_fields.includes('location')) {
            delete mutableFields.location_details;
            delete mutableFields.location_normalization_status;
            delete mutableFields.location_normalized_at;
          }
        }
        if (scrapeMethod === 'manual') {
          mutableFields.description_source = 'manual';
        } else if ('description' in mutableFields) {
          mutableFields.description_source = 'scrape';
        }
        const result = await col.findOneAndUpdate(
          { _id: existing._id, userId },
          {
            $set: {
              url: identity.canonicalUrl,
              url_hash: existing.url_hash ?? sha256(data.url),
              dedup_key: identity.dedupKey,
              dedup_version: 2,
              source: identity.source,
              source_key: identity.sourceKey,
              ...(identity.nativeJobId ? { native_job_id: identity.nativeJobId } : {}),
              ...(data.source_label ? { source_label: data.source_label } : {}),
              ...mutableFields,
              scrape_method: scrapeMethod,
              scraped_at: now,
              scrape_status: 'succeeded',
              scrape_steps: [],
              scrape_error: null,
              scrape_error_code: null,
              scrape_error_category: null,
              scrape_message_id: null,
              scrape_started_at: null,
              scrape_finished_at: now,
              ...(scrapeMethod === 'manual' ? { manually_repaired_at: now } : {}),
              ...(scrapeMethod === 'manual' ? { manual_fields: nextManualFields } : {}),
              updated_at: now,
            },
            $inc: { scrape_attempts: 1 },
          },
          { returnDocument: 'after' },
        );
        if (!result?._id) throw new Error('Unable to repair job posting');
        return {
          json: {
            jobPostingId: result._id.toString(),
            cached: false,
            repaired: true,
          },
        };
      }

      const doc: JobPostingDoc = {
        userId,
        url: identity.canonicalUrl,
        url_hash: sha256(data.url),
        dedup_key: identity.dedupKey,
        dedup_version: 2,
        source: identity.source,
        source_key: identity.sourceKey,
        ...(identity.nativeJobId ? { native_job_id: identity.nativeJobId } : {}),
        ...(data.source_label ? { source_label: data.source_label } : {}),
        title: data.title,
        company: data.company,
        location: null,
        location_details: null,
        location_normalization_status: 'skipped',
        location_normalized_at: null,
        description: null,
        contract_type: null,
        remote: null,
        salary: null,
        requirements: null,
        keywords: null,
        company_website: null,
        ...providedFields,
        description_source: scrapeMethod === 'manual' ? 'manual' : 'scrape',
        scrape_method: scrapeMethod,
        scraped_at: now,
        scrape_status: 'succeeded',
        scrape_steps: [],
        scrape_attempts: 1,
        scrape_error: null,
        scrape_error_code: null,
        scrape_error_category: null,
        scrape_message_id: null,
        scrape_started_at: null,
        scrape_finished_at: now,
        ...(scrapeMethod === 'manual' ? { manually_repaired_at: now } : {}),
        ...(scrapeMethod === 'manual' ? { manual_fields: manualFields } : {}),
        created_at: now,
        updated_at: now,
      };

      const result = await col.findOneAndUpdate(
        { userId, dedup_key: identity.dedupKey },
        { $setOnInsert: doc },
        { upsert: true, returnDocument: 'after' },
      );
      if (!result?._id) throw new Error('Unable to create job posting');
      const cached = result.created_at?.getTime() !== now.getTime();
      return {
        status: cached ? 200 : 201,
        json: { jobPostingId: result._id.toString(), cached },
      };
    },
  }),
});

async function buildProvidedFields(data: z.infer<typeof CreateJobPostingSchema>) {
  const fields: Partial<JobPostingDoc> = {};
  if ('location' in data) Object.assign(fields, await normalizeLocationForStorage(data.location ?? null));
  if ('description' in data) fields.description = data.description ?? null;
  if ('contract_type' in data) fields.contract_type = data.contract_type ?? null;
  if ('remote' in data) fields.remote = data.remote ?? null;
  if ('salary' in data) fields.salary = data.salary ?? null;
  if ('requirements' in data) fields.requirements = data.requirements ?? null;
  if ('keywords' in data) fields.keywords = data.keywords ?? null;
  if ('company_website' in data) fields.company_website = data.company_website ?? null;
  return fields;
}
