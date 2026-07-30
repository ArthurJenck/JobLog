import type { LocationNormalizationStatus } from '@joblog/shared';
import { ObjectId, type Filter } from 'mongodb';
import { normalizeLocationForStorage } from '../../lib/addresses.js';
import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;

interface JobPostingLocationDoc {
  _id: ObjectId;
  location?: string | null;
  location_normalization_status?: LocationNormalizationStatus | null;
}

type StatusCounts = Record<LocationNormalizationStatus, number>;

function parseLimit(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(1, Math.trunc(parsed)));
}

export default defineHandler({
  POST: method({
    auth: 'cron',
    async handle({ query }) {
      const limit = parseLimit((query as { limit?: string | string[] }).limit);
      const col = await getCollection<JobPostingLocationDoc>('job_postings');
      const candidatesFilter = {
        location: { $type: 'string', $ne: '' },
        $or: [
          { location_normalization_status: { $exists: false } },
          { location_normalization_status: null },
        ],
      } as Filter<JobPostingLocationDoc>;
      const candidates = await col.find(candidatesFilter).limit(limit).toArray();

      const counts: StatusCounts = {
        matched: 0,
        unmatched: 0,
        ambiguous: 0,
        skipped: 0,
        error: 0,
      };
      let failed = 0;
      const errors: string[] = [];

      for (const jobPosting of candidates) {
        const jobPostingId = String(jobPosting._id);
        const originalLocation = jobPosting.location?.trim();
        if (!originalLocation) continue;

        try {
          const normalized = await normalizeLocationForStorage(originalLocation);
          counts[normalized.location_normalization_status]++;

          const setOps: Record<string, unknown> = {
            location_details: normalized.location_details,
            location_normalization_status: normalized.location_normalization_status,
            location_normalized_at: normalized.location_normalized_at,
          };

          if (
            normalized.location_normalization_status === 'matched' &&
            normalized.location
          ) {
            setOps.location = normalized.location;
          }

          await col.updateOne(
            {
              _id: jobPosting._id,
              $or: [
                { location_normalization_status: { $exists: false } },
                { location_normalization_status: null },
              ],
            },
            { $set: setOps },
          );
        } catch (error) {
          failed++;
          errors.push(
            `${jobPostingId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      return {
        json: {
          processed: candidates.length,
          failed,
          ...counts,
          errors: errors.slice(0, 10),
        },
      };
    },
  }),
});
