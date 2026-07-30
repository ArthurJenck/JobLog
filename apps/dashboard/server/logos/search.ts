import { z } from 'zod';
import { getEnv } from '../../lib/env.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';

const QuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  strategy: z.enum(['suggest', 'match']).optional(),
});

interface LogoDevSearchResult {
  name?: unknown;
  domain?: unknown;
}

function normalizeDomain(value: string) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const hostname = url.hostname.replace(/^www\./i, '').toLowerCase();
    return hostname.includes('.') ? hostname : null;
  } catch {
    return null;
  }
}

export default defineHandler({
  GET: method({
    query: QuerySchema,
    rateLimit: {
      max: 30,
      windowMs: 60 * 1000,
      scope: ({ user }) => `logos-search:${user!.id}`,
    },
    async handle({ query }) {
      const secretKey = getEnv('LOGO_DEV_SECRET_KEY');
      if (!secretKey) throw new ApiError(503, 'internal_error', 'Logo.dev search is not configured');

      const params = new URLSearchParams({
        q: query.q,
        strategy: query.strategy ?? 'suggest',
      });

      let logoDevRes: Response;
      try {
        logoDevRes = await fetch(`https://api.logo.dev/search?${params.toString()}`, {
          headers: { Authorization: `Bearer ${secretKey}` },
          signal: AbortSignal.timeout(8_000),
        });
      } catch {
        throw new ApiError(502, 'internal_error', 'Logo.dev search unavailable');
      }

      if (!logoDevRes.ok) {
        throw new ApiError(logoDevRes.status, 'internal_error', 'Logo.dev search failed');
      }

      const raw = await logoDevRes.json().catch(() => []) as unknown;
      const results = Array.isArray(raw) ? raw as LogoDevSearchResult[] : [];
      const data = results
        .map((item) => ({
          name: typeof item.name === 'string' ? item.name.trim() : '',
          domain: typeof item.domain === 'string' ? normalizeDomain(item.domain) : null,
        }))
        .filter((item): item is { name: string; domain: string } => Boolean(item.name && item.domain))
        .slice(0, 8);

      return { json: { data } };
    },
  }),
});
