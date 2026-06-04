import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getCollection } from '../../lib/db.js';
import { normalizeLocationForStorage } from '../../lib/addresses.js';
import type { LocationNormalizationStatus } from '@joblog/shared';

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;

interface JobPostingLocationDoc {
  _id: ObjectId;
  location?: string | null;
  location_normalization_status?: LocationNormalizationStatus | null;
}

type StatusCounts = Record<LocationNormalizationStatus, number>;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const limit = parseLimit(req.query.limit);
  const col = await getCollection<JobPostingLocationDoc>('job_postings');
  const candidates = await col.find({
    location: { $type: 'string', $ne: '' },
    $or: [
      { location_normalization_status: { $exists: false } },
      { location_normalization_status: null },
    ],
  }).limit(limit).toArray();

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
        `${jobPosting._id.toString()}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return res.status(200).json({
    processed: candidates.length,
    failed,
    ...counts,
    errors: errors.slice(0, 10),
  });
}

function parseLimit(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(1, Math.trunc(parsed)));
}
