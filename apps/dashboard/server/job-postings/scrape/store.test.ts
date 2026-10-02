import { describe, expect, test } from 'vitest';
import { ObjectId } from 'mongodb';
import { buildScrapeWriteFilter, isActiveScrapeStale } from './store.js';

describe('isActiveScrapeStale', () => {
  test('marks active scrapes stale after fifteen minutes', () => {
    const now = new Date('2026-09-17T12:00:00.000Z');
    expect(isActiveScrapeStale({
      url: 'https://example.com/jobs/42',
      scrape_status: 'processing',
      updated_at: new Date('2026-09-17T11:45:00.000Z'),
    }, now)).toBe(true);
    expect(isActiveScrapeStale({
      url: 'https://example.com/jobs/42',
      scrape_status: 'queued',
      updated_at: new Date('2026-09-17T11:45:00.001Z'),
    }, now)).toBe(false);
  });
});

describe('buildScrapeWriteFilter', () => {
  test('guards every consumer write against manual repair and stale attempts', () => {
    const jobPostingId = new ObjectId();
    expect(buildScrapeWriteFilter({
      jobPostingId,
      userId: 'user-1',
      dedupKey: 'key-1',
      attempt: 3,
    })).toEqual({
      _id: jobPostingId,
      userId: 'user-1',
      dedup_key: 'key-1',
      scrape_attempts: 3,
      scrape_status: { $ne: 'succeeded' },
      manually_repaired_at: null,
    });
  });
});
