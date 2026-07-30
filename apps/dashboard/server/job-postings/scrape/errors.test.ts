import { describe, expect, test } from 'vitest';
import { unreadableUrlMessage } from './content-filters.js';
import {
  ScrapeFailure,
  classifyErrorCategory,
  isFirecrawlTransientError,
  isTransientScrapeError,
  queueFailureMessage,
  toScrapeFailure,
} from './errors.js';

describe('classifyErrorCategory', () => {
  test('site blocked', () => {
    expect(classifyErrorCategory('site_blocks_reader')).toBe('site_blocked');
    expect(classifyErrorCategory('jina_target_unreadable')).toBe('site_blocked');
  });
  test('service unavailable', () => {
    expect(classifyErrorCategory('jina_unavailable')).toBe('service_unavailable');
    expect(classifyErrorCategory('gemini_quota_exceeded')).toBe('service_unavailable');
    expect(classifyErrorCategory('queue_unavailable')).toBe('service_unavailable');
  });
  test('extraction failed', () => {
    expect(classifyErrorCategory('gemini_extraction_failed')).toBe('extraction_failed');
  });
  test('other', () => {
    expect(classifyErrorCategory('unknown_scrape_error')).toBe('other');
  });
});

describe('transient classification', () => {
  test('transient scrape errors', () => {
    expect(isTransientScrapeError('jina_unavailable')).toBe(true);
    expect(isTransientScrapeError('firecrawl_rate_limited')).toBe(true);
  });
  test('permanent scrape errors', () => {
    expect(isTransientScrapeError('jina_target_unreadable')).toBe(false);
    expect(isTransientScrapeError('firecrawl_target_unreadable')).toBe(false);
  });
  test('firecrawl transient', () => {
    expect(isFirecrawlTransientError('firecrawl_auth_error')).toBe(true);
    expect(isFirecrawlTransientError('firecrawl_target_unreadable')).toBe(false);
  });
});

describe('toScrapeFailure', () => {
  test('passes through ScrapeFailure', () => {
    const failure = new ScrapeFailure('jina_unavailable', 'down', 503);
    expect(toScrapeFailure(failure, 'https://x')).toBe(failure);
  });
  test('wraps generic Error', () => {
    const result = toScrapeFailure(new Error('boom'), 'https://x');
    expect(result.code).toBe('unknown_scrape_error');
    expect(result.message).toBe('boom');
  });
  test('uses unreadable message for non-error', () => {
    const url = 'https://linkedin.com/jobs/1';
    const result = toScrapeFailure('nope', url);
    expect(result.code).toBe('unknown_scrape_error');
    expect(result.message).toBe(unreadableUrlMessage(url));
  });
});

describe('queueFailureMessage', () => {
  test('includes underlying error message', () => {
    expect(queueFailureMessage(new Error('timeout'))).toContain('(timeout)');
  });
  test('default message for non-error', () => {
    expect(queueFailureMessage(null)).toBe(
      'La file de traitement est indisponible pour le moment. Réessaie dans quelques instants.',
    );
  });
});
