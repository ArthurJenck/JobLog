import jwt from 'jsonwebtoken';
import { requireEnv } from './env.js';

export const MAX_BULK_SNOOZE_IDS = 25;

const MIN_EXPIRY_DAYS = 7;

export type SnoozePayload =
  | { kind: 'single'; applicationId: string; userId: string }
  | { kind: 'bulk'; applicationIds: string[]; userId: string };

function expirySeconds(frequencyDays?: number) {
  const days = Number.isFinite(frequencyDays) ? Math.trunc(frequencyDays!) : 0;
  return Math.max(MIN_EXPIRY_DAYS, days + 1) * 24 * 60 * 60;
}

function sign(payload: object, frequencyDays?: number) {
  return jwt.sign(payload, requireEnv('SNOOZE_JWT_SECRET'), {
    algorithm: 'HS256',
    expiresIn: expirySeconds(frequencyDays),
  });
}

export function signSnoozeToken(
  applicationId: string,
  userId: string,
  frequencyDays?: number
): string {
  return sign({ applicationId, userId }, frequencyDays);
}

export function signBulkSnoozeToken(
  userId: string,
  applicationIds: string[],
  frequencyDays?: number
): string {
  return sign(
    { kind: 'bulk', userId, applicationIds: applicationIds.slice(0, MAX_BULK_SNOOZE_IDS) },
    frequencyDays
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function normalizePayload(decoded: unknown): SnoozePayload | null {
  if (typeof decoded !== 'object' || decoded === null) return null;
  const raw = decoded as Record<string, unknown>;

  if (!isNonEmptyString(raw.userId)) return null;

  if (raw.kind === 'bulk') {
    const ids = raw.applicationIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BULK_SNOOZE_IDS) return null;
    if (!ids.every(isNonEmptyString)) return null;
    return { kind: 'bulk', userId: raw.userId, applicationIds: ids };
  }

  if (raw.kind !== undefined && raw.kind !== 'single') return null;
  if (!isNonEmptyString(raw.applicationId)) return null;

  return { kind: 'single', userId: raw.userId, applicationId: raw.applicationId };
}

export function verifySnoozeToken(token: string): SnoozePayload | null {
  try {
    return normalizePayload(
      jwt.verify(token, requireEnv('SNOOZE_JWT_SECRET'), { algorithms: ['HS256'] })
    );
  } catch {
    return null;
  }
}
