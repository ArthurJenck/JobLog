import { unreadableUrlMessage } from './content-filters.js';
import type { UrlUsage } from '../../usage/url-usage.js';

export type ScrapeErrorCategory = 'site_blocked' | 'service_unavailable' | 'extraction_failed' | 'no_content' | 'other';

export class UrlScrapeHttpError extends Error {
  status: number;
  code: string;
  usage: UrlUsage;
  extensionUrl: string | null;

  constructor({
    status,
    code,
    message,
    usage,
    extensionUrl,
  }: {
    status: number;
    code: string;
    message: string;
    usage: UrlUsage;
    extensionUrl: string | null;
  }) {
    super(message);
    this.status = status;
    this.code = code;
    this.usage = usage;
    this.extensionUrl = extensionUrl;
  }
}

export class ScrapeFailure extends Error {
  code: string;
  providerStatus?: number | null;

  constructor(code: string, message: string, providerStatus?: number | null) {
    super(message);
    this.code = code;
    this.providerStatus = providerStatus;
  }
}

export function classifyErrorCategory(code: string): ScrapeErrorCategory {
  if (code === 'site_blocks_reader' || code.endsWith('_target_unreadable')) {
    return 'site_blocked';
  }
  if (
    code.endsWith('_unavailable') ||
    code.endsWith('_rate_limited') ||
    code.endsWith('_fetch_failed') ||
    code.endsWith('_auth_error') ||
    code.endsWith('_balance_error') ||
    code.endsWith('_quota_exhausted') ||
    code === 'gemini_missing_api_key' ||
    code === 'gemini_quota_exceeded' ||
    code === 'jina_missing_api_key' ||
    code === 'queue_unavailable'
  ) {
    return 'service_unavailable';
  }
  if (code === 'gemini_extraction_failed') {
    return 'extraction_failed';
  }
  return 'other';
}

export function isFirecrawlTransientError(errorCode: string) {
  return errorCode === 'firecrawl_auth_error' ||
    errorCode === 'firecrawl_quota_exhausted' ||
    errorCode === 'firecrawl_rate_limited' ||
    errorCode === 'firecrawl_unavailable' ||
    errorCode === 'firecrawl_fetch_failed';
}

export function isTransientScrapeError(errorCode: string) {
  return errorCode === 'jina_auth_error' ||
    errorCode === 'jina_balance_error' ||
    errorCode === 'jina_rate_limited' ||
    errorCode === 'jina_unavailable' ||
    errorCode === 'jina_fetch_failed' ||
    isFirecrawlTransientError(errorCode);
}

export function toScrapeFailure(err: unknown, url: string) {
  if (err instanceof ScrapeFailure) return err;
  const message = err instanceof Error ? err.message : unreadableUrlMessage(url);
  return new ScrapeFailure('unknown_scrape_error', message || unreadableUrlMessage(url));
}

export function queueFailureMessage(err: unknown) {
  if (err instanceof Error && err.message) {
    return `La file de traitement est indisponible pour le moment. Réessaie dans quelques instants. (${err.message})`;
  }

  return 'La file de traitement est indisponible pour le moment. Réessaie dans quelques instants.';
}
