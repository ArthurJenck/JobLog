import { describe, expect, test } from 'vitest';
import { computeWindow } from './rate-limit.js';

describe('computeWindow', () => {
  test('aligns windowStart to fixed window boundary', () => {
    const windowMs = 60_000;
    const now = 1_700_000_123_456;
    const { windowStart, expiresAt } = computeWindow(now, windowMs);
    expect(windowStart.getTime() % windowMs).toBe(0);
    expect(expiresAt.getTime() - windowStart.getTime()).toBe(windowMs);
    expect(windowStart.getTime()).toBeLessThanOrEqual(now);
    expect(expiresAt.getTime()).toBeGreaterThan(now);
  });

  test('same window for timestamps within the same bucket', () => {
    const windowMs = 3_600_000;
    const base = Math.floor(Date.now() / windowMs) * windowMs;
    const a = computeWindow(base + 10, windowMs);
    const b = computeWindow(base + windowMs - 1, windowMs);
    expect(a.windowStart.getTime()).toBe(b.windowStart.getTime());
  });

  test('different windows across a boundary', () => {
    const windowMs = 60_000;
    const base = Math.floor(Date.now() / windowMs) * windowMs;
    const a = computeWindow(base + windowMs - 1, windowMs);
    const b = computeWindow(base + windowMs, windowMs);
    expect(b.windowStart.getTime() - a.windowStart.getTime()).toBe(windowMs);
  });
});
