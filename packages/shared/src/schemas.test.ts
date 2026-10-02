import { describe, expect, test } from 'vitest';
import {
  ReminderSchema,
  UrlScrapeMessageSchema,
  UrlScrapeMessageV1Schema,
  UrlScrapeMessageV2Schema,
} from './schemas.js';

describe('ReminderSchema', () => {
  test('treats a missing legacy enabled flag as enabled', () => {
    const reminder = ReminderSchema.parse({
      at: null,
      frequencyDays: 7,
      maxCount: 3,
      sentCount: 0,
      snoozedUntil: null,
    });
    expect(reminder.enabled).toBe(true);
  });
});

describe('URL scrape messages', () => {
  const common = {
    jobPostingId: '507f1f77bcf86cd799439011',
    userId: 'user-1',
    url: 'https://example.com/jobs/42',
    attempt: 1,
  };
  const hash = 'a'.repeat(64);

  test('accepts legacy v1 messages during the transition', () => {
    expect(UrlScrapeMessageV1Schema.safeParse({ ...common, url_hash: hash }).success).toBe(true);
    expect(UrlScrapeMessageSchema.safeParse({ ...common, url_hash: hash }).success).toBe(true);
  });

  test('accepts v2 and rejects hybrid messages', () => {
    expect(
      UrlScrapeMessageV2Schema.safeParse({ ...common, version: 2, dedup_key: hash }).success,
    ).toBe(true);
    expect(
      UrlScrapeMessageSchema.safeParse({
        ...common,
        version: 2,
        dedup_key: hash,
        url_hash: hash,
      }).success,
    ).toBe(false);
  });
});
