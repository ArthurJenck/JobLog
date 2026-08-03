import jwt from 'jsonwebtoken';
import { beforeAll, describe, expect, test } from 'vitest';

const SECRET = 'test-snooze-secret';

beforeAll(() => {
  process.env.SNOOZE_JWT_SECRET = SECRET;
});

const { MAX_BULK_SNOOZE_IDS, signBulkSnoozeToken, signSnoozeToken, verifySnoozeToken } =
  await import('./snooze.js');

describe('signSnoozeToken', () => {
  test('round-trips a single payload', () => {
    const token = signSnoozeToken('app-1', 'user-1', 7);
    expect(verifySnoozeToken(token)).toEqual({
      kind: 'single',
      applicationId: 'app-1',
      userId: 'user-1',
    });
  });

  test('expiry covers the next reminder for long frequencies', () => {
    const decoded = jwt.decode(signSnoozeToken('app-1', 'user-1', 14)) as {
      iat: number;
      exp: number;
    };
    expect((decoded.exp - decoded.iat) / 86_400).toBe(15);
  });

  test('expiry never drops below 7 days', () => {
    const decoded = jwt.decode(signSnoozeToken('app-1', 'user-1', 1)) as {
      iat: number;
      exp: number;
    };
    expect((decoded.exp - decoded.iat) / 86_400).toBe(7);
  });
});

describe('signBulkSnoozeToken', () => {
  test('round-trips a bulk payload', () => {
    const token = signBulkSnoozeToken('user-1', ['app-1', 'app-2'], 7);
    expect(verifySnoozeToken(token)).toEqual({
      kind: 'bulk',
      userId: 'user-1',
      applicationIds: ['app-1', 'app-2'],
    });
  });

  test('caps the id list', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `app-${i}`);
    const payload = verifySnoozeToken(signBulkSnoozeToken('user-1', ids, 7));
    expect(payload?.kind).toBe('bulk');
    expect(payload?.kind === 'bulk' && payload.applicationIds).toHaveLength(MAX_BULK_SNOOZE_IDS);
  });
});

describe('verifySnoozeToken', () => {
  test('accepts a legacy payload without kind', () => {
    const token = jwt.sign({ applicationId: 'app-1', userId: 'user-1' }, SECRET, {
      expiresIn: '7d',
    });
    expect(verifySnoozeToken(token)).toEqual({
      kind: 'single',
      applicationId: 'app-1',
      userId: 'user-1',
    });
  });

  test('rejects a tampered token', () => {
    const token = signSnoozeToken('app-1', 'user-1', 7);
    expect(verifySnoozeToken(`${token.slice(0, -2)}xy`)).toBeNull();
  });

  test('rejects a token signed with another secret', () => {
    const token = jwt.sign({ applicationId: 'app-1', userId: 'user-1' }, 'other-secret', {
      expiresIn: '7d',
    });
    expect(verifySnoozeToken(token)).toBeNull();
  });

  test('rejects an unsigned token', () => {
    const token = jwt.sign({ applicationId: 'app-1', userId: 'user-1' }, '', {
      algorithm: 'none',
    });
    expect(verifySnoozeToken(token)).toBeNull();
  });

  test('rejects an expired token', () => {
    const token = jwt.sign({ applicationId: 'app-1', userId: 'user-1' }, SECRET, {
      expiresIn: '-1s',
    });
    expect(verifySnoozeToken(token)).toBeNull();
  });

  test('rejects a malformed payload', () => {
    expect(verifySnoozeToken(jwt.sign({ userId: 'user-1' }, SECRET))).toBeNull();
    expect(verifySnoozeToken(jwt.sign({ applicationId: 'app-1' }, SECRET))).toBeNull();
    expect(
      verifySnoozeToken(jwt.sign({ kind: 'bulk', userId: 'u', applicationIds: [] }, SECRET))
    ).toBeNull();
    expect(
      verifySnoozeToken(jwt.sign({ kind: 'bulk', userId: 'u', applicationIds: [1, 2] }, SECRET))
    ).toBeNull();
  });
});
