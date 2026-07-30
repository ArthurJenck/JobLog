import { GEMINI_DAILY_QUOTA, GEMINI_SCRAPE_RESERVE, GEMINI_USER_DAILY_QUOTA } from '@joblog/shared';
import { getCollection } from '../../lib/db.js';
import { getEnv } from '../../lib/env.js';

const ANALYSIS_USAGE_KIND = 'cv_analysis';

interface UsageLimitDoc {
  userId: string;
  date: string;
  kind: string;
  count: number;
  created_at: Date;
  updated_at: Date;
}

export type QuotaCheckResult = 'ok' | 'user_limit' | 'global_limit';

export function getDailyQuota() {
  const raw = Number(getEnv('GEMINI_DAILY_QUOTA'));
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : GEMINI_DAILY_QUOTA;
}

export function getUserDailyQuota() {
  const raw = Number(getEnv('GEMINI_USER_DAILY_QUOTA'));
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : GEMINI_USER_DAILY_QUOTA;
}

export async function checkAndIncrementGeminiQuota(): Promise<boolean> {
  const col = await getCollection('quota_usage');
  const today = new Date().toISOString().slice(0, 10);
  const maxScrapeCalls = Math.max(0, GEMINI_DAILY_QUOTA - GEMINI_SCRAPE_RESERVE);

  const result = await col.findOneAndUpdate(
    { date: today, calls: { $lt: maxScrapeCalls } },
    { $inc: { calls: 1 }, $setOnInsert: { date: today } },
    { upsert: true, returnDocument: 'after' },
  );

  return result !== null;
}

export async function checkAndIncrementQuota(userId: string): Promise<QuotaCheckResult> {
  const today = new Date().toISOString().slice(0, 10);
  const usageCol = await getCollection<UsageLimitDoc>('usage_limits');
  const now = new Date();

  const userResult = await usageCol.findOneAndUpdate(
    { userId, date: today, kind: ANALYSIS_USAGE_KIND, count: { $lt: getUserDailyQuota() } },
    {
      $inc: { count: 1 },
      $set: { updated_at: now },
      $setOnInsert: { userId, date: today, kind: ANALYSIS_USAGE_KIND, created_at: now },
    },
    { upsert: true, returnDocument: 'after' }
  );
  if (!userResult) return 'user_limit';

  const quotaCol = await getCollection('quota_usage');
  const globalResult = await quotaCol.findOneAndUpdate(
    { date: today, calls: { $lt: getDailyQuota() } },
    { $inc: { calls: 1 }, $setOnInsert: { date: today } },
    { upsert: true, returnDocument: 'after' }
  );
  if (!globalResult) {
    await usageCol.updateOne(
      { userId, date: today, kind: ANALYSIS_USAGE_KIND },
      { $inc: { count: -1 } }
    );
    return 'global_limit';
  }

  return 'ok';
}
