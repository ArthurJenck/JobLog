import { getParisDateKey, getParisMonthKey } from '@joblog/shared';
import { getCollection } from '../../lib/db.js';
import { getEnv } from '../../lib/env.js';
import { sha256 } from '../../lib/hash.js';

export const FIRECRAWL_MONTHLY_SOFT_CAP = 900;
const JINA_ALERT_THRESHOLD_DEFAULT = 8_000_000;

interface JinaUsageDoc {
  date: string;
  keyHash: string;
  calls: number;
  successCalls: number;
  failureCalls: number;
  estimatedTokens: number;
  lastStatus: number | null;
  lastErrorCode?: string;
  lastErrorAt?: Date;
  alertThreshold: number;
  alertedAt: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface FirecrawlUsageDoc {
  month: string;
  calls: number;
  successCalls: number;
  failureCalls: number;
  lastStatus: number | null;
  lastErrorCode?: string;
  lastErrorAt?: Date;
  alertedAt: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function getJinaAlertThreshold() {
  const raw = getEnv('JINA_ESTIMATED_TOKEN_ALERT_THRESHOLD');
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? Math.trunc(parsed)
    : JINA_ALERT_THRESHOLD_DEFAULT;
}

export function estimateTokens(chars: number) {
  return Math.max(0, Math.ceil(chars / 4));
}

export async function recordJinaUsage({
  apiKey,
  status,
  outputChars,
  errorCode,
}: {
  apiKey: string;
  status: number | null;
  outputChars: number;
  errorCode: string | null;
}) {
  const col = await getCollection<JinaUsageDoc>('jina_usage');
  const date = getParisDateKey();
  const now = new Date();
  const estimatedTokens = estimateTokens(outputChars);
  const keyHash = sha256(apiKey).slice(0, 16);
  const isSuccess = !errorCode;
  const alertThreshold = getJinaAlertThreshold();

  await col.updateOne(
    { date, keyHash },
    {
      $inc: {
        calls: 1,
        successCalls: isSuccess ? 1 : 0,
        failureCalls: isSuccess ? 0 : 1,
        estimatedTokens,
      },
      $set: {
        updated_at: now,
        lastStatus: status,
        alertThreshold,
        ...(errorCode ? { lastErrorCode: errorCode, lastErrorAt: now } : {}),
      },
      $setOnInsert: {
        date,
        keyHash,
        created_at: now,
        alertedAt: null,
      },
    },
    { upsert: true },
  );
}

export async function reserveFirecrawlSlot(): Promise<boolean> {
  const col = await getCollection<FirecrawlUsageDoc>('firecrawl_usage');
  const month = getParisMonthKey();
  const now = new Date();

  const result = await col.findOneAndUpdate(
    { month, calls: { $lt: FIRECRAWL_MONTHLY_SOFT_CAP } },
    {
      $inc: { calls: 1 },
      $set: { updated_at: now },
      $setOnInsert: {
        month,
        successCalls: 0,
        failureCalls: 0,
        lastStatus: null,
        alertedAt: null,
        created_at: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  return result !== null;
}

export async function releaseFirecrawlSlot() {
  const col = await getCollection<FirecrawlUsageDoc>('firecrawl_usage');
  const month = getParisMonthKey();

  await col.updateOne(
    { month, calls: { $gt: 0 } },
    { $inc: { calls: -1 }, $set: { updated_at: new Date() } },
  );
}

export async function recordFirecrawlUsage({
  status,
  errorCode,
}: {
  status: number | null;
  errorCode: string | null;
}) {
  const col = await getCollection<FirecrawlUsageDoc>('firecrawl_usage');
  const month = getParisMonthKey();
  const now = new Date();
  const isSuccess = !errorCode;

  await col.updateOne(
    { month },
    {
      $inc: {
        successCalls: isSuccess ? 1 : 0,
        failureCalls: isSuccess ? 0 : 1,
      },
      $set: {
        updated_at: now,
        lastStatus: status,
        ...(errorCode ? { lastErrorCode: errorCode, lastErrorAt: now } : {}),
      },
      $setOnInsert: {
        month,
        calls: 0,
        alertedAt: null,
        created_at: now,
      },
    },
    { upsert: true },
  );
}
