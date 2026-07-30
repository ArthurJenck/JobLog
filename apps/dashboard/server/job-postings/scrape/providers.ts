import { type ScrapeMethod } from '@joblog/shared';
import { getEnv } from '../../../lib/env.js';
import {
  recordFirecrawlUsage,
  recordJinaUsage,
  releaseFirecrawlSlot,
  reserveFirecrawlSlot,
} from '../../usage/provider-usage.js';
import { ScrapeFailure, isFirecrawlTransientError } from './errors.js';

const JINA_READER_URL = 'https://r.jina.ai/';
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2/scrape';

export type ScrapeResult = {
  ok: true;
  markdown: string;
  status: number;
  errorCode: null;
  provider: ScrapeMethod;
} | {
  ok: false;
  markdown: null;
  status: number | null;
  errorCode: string;
  provider: ScrapeMethod;
};

export async function fetchJinaMarkdown(url: string, apiKey: string): Promise<ScrapeResult> {
  try {
    const resp = await fetch(`${JINA_READER_URL}${url}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/plain',
        'X-Respond-With': 'markdown',
        'X-Remove-Selector': 'script, style, noscript, header, nav, footer',
      },
      signal: AbortSignal.timeout(25_000),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return {
        ok: false,
        markdown: null,
        status: resp.status,
        errorCode: classifyJinaHttpError(resp.status, text),
        provider: 'jina',
      };
    }

    return { ok: true, markdown: text, status: resp.status, errorCode: null, provider: 'jina' };
  } catch {
    return {
      ok: false,
      markdown: null,
      status: null,
      errorCode: 'jina_fetch_failed',
      provider: 'jina',
    };
  }
}

export function classifyJinaHttpError(status: number, body: string) {
  const text = body.toLowerCase();
  if (status === 401 || text.includes('auth_missing') || text.includes('auth_invalid')) {
    return 'jina_auth_error';
  }
  if (
    status === 403 &&
    (text.includes('insufficient') || text.includes('balance') || text.includes('authz_'))
  ) {
    return 'jina_balance_error';
  }
  if (status === 429 || text.includes('rate_') || text.includes('rate limit')) {
    return 'jina_rate_limited';
  }
  if (status >= 500) return 'jina_unavailable';
  return 'jina_target_unreadable';
}

export async function fetchFirecrawlMarkdown(url: string, apiKey: string): Promise<ScrapeResult> {
  try {
    const resp = await fetch(FIRECRAWL_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      signal: AbortSignal.timeout(25_000),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return {
        ok: false,
        markdown: null,
        status: resp.status,
        errorCode: classifyFirecrawlHttpError(resp.status, text),
        provider: 'firecrawl',
      };
    }

    const data = JSON.parse(text) as { data?: { markdown?: string; metadata?: { statusCode?: number } } };
    const markdown = data.data?.markdown;
    if (!markdown) {
      return {
        ok: false,
        markdown: null,
        status: resp.status,
        errorCode: 'firecrawl_target_unreadable',
        provider: 'firecrawl',
      };
    }

    return {
      ok: true,
      markdown,
      status: data.data?.metadata?.statusCode ?? resp.status,
      errorCode: null,
      provider: 'firecrawl',
    };
  } catch {
    return {
      ok: false,
      markdown: null,
      status: null,
      errorCode: 'firecrawl_fetch_failed',
      provider: 'firecrawl',
    };
  }
}

export function classifyFirecrawlHttpError(status: number, body: string) {
  const text = body.toLowerCase();
  if (status === 401 || text.includes('unauthorized') || text.includes('invalid api key')) {
    return 'firecrawl_auth_error';
  }
  if (status === 402 || text.includes('insufficient credits') || text.includes('payment required')) {
    return 'firecrawl_quota_exhausted';
  }
  if (status === 429 || text.includes('rate limit')) {
    return 'firecrawl_rate_limited';
  }
  if (status >= 500) return 'firecrawl_unavailable';
  return 'firecrawl_target_unreadable';
}

export async function scrapeWithFallback(url: string): Promise<ScrapeResult> {
  const firecrawlApiKey = getEnv('FIRECRAWL_API_KEY');

  if (firecrawlApiKey) {
    const reserved = await reserveFirecrawlSlot();
    if (reserved) {
      const result = await fetchFirecrawlMarkdown(url, firecrawlApiKey);
      await recordFirecrawlUsage({ status: result.status, errorCode: result.errorCode });

      if (result.ok) return result;

      if (!isFirecrawlTransientError(result.errorCode)) return result;

      await releaseFirecrawlSlot();
    }
  }

  const jinaApiKey = getEnv('JINA_API_KEY');
  if (!jinaApiKey) {
    throw new ScrapeFailure('jina_missing_api_key', 'Service de récupération temporairement indisponible.');
  }

  const jinaResult = await fetchJinaMarkdown(url, jinaApiKey);
  await recordJinaUsage({
    apiKey: jinaApiKey,
    status: jinaResult.status,
    outputChars: jinaResult.markdown?.length ?? 0,
    errorCode: jinaResult.errorCode,
  });

  return jinaResult;
}
