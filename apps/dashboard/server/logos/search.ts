import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getEnv } from '../../lib/env.js';
import { requireSession } from '../../lib/session.js';

const QuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  strategy: z.enum(['suggest', 'match']).optional(),
});

interface LogoDevSearchResult {
  name?: unknown;
  domain?: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session) return;

  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const secretKey = getEnv('LOGO_DEV_SECRET_KEY');
  if (!secretKey) return res.status(503).json({ error: 'Logo.dev search is not configured' });

  const params = new URLSearchParams({
    q: parsed.data.q,
    strategy: parsed.data.strategy ?? 'suggest',
  });

  let logoDevRes: Response;
  try {
    logoDevRes = await fetch(`https://api.logo.dev/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return res.status(502).json({ error: 'Logo.dev search unavailable' });
  }

  if (!logoDevRes.ok) {
    return res.status(logoDevRes.status).json({ error: 'Logo.dev search failed' });
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

  return res.status(200).json({ data });
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
