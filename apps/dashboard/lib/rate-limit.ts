import type { VercelRequest } from '@vercel/node';
import { getCollection } from './db.js';

interface RateLimitDoc {
  key: string;
  windowStart: Date;
  count: number;
  expiresAt: Date;
}

export interface RateLimitParams {
  key: string;
  max: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export function computeWindow(now: number, windowMs: number): { windowStart: Date; expiresAt: Date } {
  const startMs = Math.floor(now / windowMs) * windowMs;
  return { windowStart: new Date(startMs), expiresAt: new Date(startMs + windowMs) };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

export async function checkRateLimit({ key, max, windowMs }: RateLimitParams): Promise<RateLimitResult> {
  const now = Date.now();
  const { windowStart, expiresAt } = computeWindow(now, windowMs);
  const retryAfter = Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000));

  const col = await getCollection<RateLimitDoc>('rate_limits');
  try {
    const result = await col.findOneAndUpdate(
      { key, windowStart, count: { $lt: max } },
      { $inc: { count: 1 }, $setOnInsert: { key, windowStart, expiresAt } },
      { upsert: true, returnDocument: 'after' },
    );
    if (!result) return { allowed: false, retryAfter };
    return { allowed: true };
  } catch (error) {
    if (isDuplicateKeyError(error)) return { allowed: false, retryAfter };
    throw error;
  }
}

export function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
}
