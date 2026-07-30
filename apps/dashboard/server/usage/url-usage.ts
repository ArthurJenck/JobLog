import { getParisDateKey } from '@joblog/shared';
import { getCollection } from '../../lib/db.js';

const URL_USAGE_KIND = 'url_paste';
const URL_USAGE_WARNING_AT = 12;
const URL_USAGE_LIMIT = 15;

export type UrlUsage = {
  date: string;
  count: number;
  warningAt: number;
  limit: number;
  remaining: number;
  shouldWarn: boolean;
  isBlocked: boolean;
};

interface UsageLimitDoc {
  userId: string;
  date: string;
  kind: string;
  count: number;
  created_at: Date;
  updated_at: Date;
}

export function normalizeCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function buildUrlUsage(date: string, count: number): UrlUsage {
  return {
    date,
    count,
    warningAt: URL_USAGE_WARNING_AT,
    limit: URL_USAGE_LIMIT,
    remaining: Math.max(0, URL_USAGE_LIMIT - count),
    shouldWarn: count >= URL_USAGE_WARNING_AT,
    isBlocked: count >= URL_USAGE_LIMIT,
  };
}

export async function getUrlUsage(userId: string): Promise<UrlUsage> {
  const col = await getCollection<UsageLimitDoc>('usage_limits');
  const date = getParisDateKey();
  const usage = await col.findOne({ userId, date, kind: URL_USAGE_KIND });
  const count = normalizeCount(usage?.count);

  return buildUrlUsage(date, count);
}

export async function incrementUrlUsage(userId: string): Promise<UrlUsage | null> {
  const col = await getCollection<UsageLimitDoc>('usage_limits');
  const date = getParisDateKey();
  const now = new Date();
  const result = await col.findOneAndUpdate(
    {
      userId,
      date,
      kind: URL_USAGE_KIND,
      count: { $lt: URL_USAGE_LIMIT },
    },
    {
      $inc: { count: 1 },
      $set: { updated_at: now },
      $setOnInsert: {
        userId,
        date,
        kind: URL_USAGE_KIND,
        created_at: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  if (!result) return null;
  return buildUrlUsage(date, normalizeCount(result.count));
}

export async function releaseUrlUsage(userId: string): Promise<UrlUsage> {
  const col = await getCollection<UsageLimitDoc>('usage_limits');
  const date = getParisDateKey();
  const now = new Date();
  const result = await col.findOneAndUpdate(
    {
      userId,
      date,
      kind: URL_USAGE_KIND,
      count: { $gt: 0 },
    },
    {
      $inc: { count: -1 },
      $set: { updated_at: now },
    },
    { returnDocument: 'after' },
  );

  return buildUrlUsage(date, normalizeCount(result?.count));
}
