import { describe, expect, test } from 'vitest';
import { buildUrlUsage, normalizeCount } from './url-usage.js';

describe('buildUrlUsage', () => {
  test('fresh counter', () => {
    expect(buildUrlUsage('2026-07-30', 0)).toEqual({
      date: '2026-07-30',
      count: 0,
      warningAt: 12,
      limit: 15,
      remaining: 15,
      shouldWarn: false,
      isBlocked: false,
    });
  });

  test('warns at threshold', () => {
    const usage = buildUrlUsage('2026-07-30', 12);
    expect(usage.shouldWarn).toBe(true);
    expect(usage.isBlocked).toBe(false);
    expect(usage.remaining).toBe(3);
  });

  test('blocks at limit', () => {
    const usage = buildUrlUsage('2026-07-30', 15);
    expect(usage.isBlocked).toBe(true);
    expect(usage.remaining).toBe(0);
  });

  test('remaining never negative', () => {
    expect(buildUrlUsage('2026-07-30', 20).remaining).toBe(0);
  });
});

describe('normalizeCount', () => {
  test('keeps positive integers', () => {
    expect(normalizeCount(5)).toBe(5);
  });
  test('floors and clamps', () => {
    expect(normalizeCount(2.9)).toBe(2);
    expect(normalizeCount(-3)).toBe(0);
  });
  test('coerces non-numbers to 0', () => {
    expect(normalizeCount(NaN)).toBe(0);
    expect(normalizeCount('x')).toBe(0);
    expect(normalizeCount(undefined)).toBe(0);
    expect(normalizeCount(null)).toBe(0);
  });
});
