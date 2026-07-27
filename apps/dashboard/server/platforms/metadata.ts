import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getEnv } from '../../lib/env.js';
import { requireSession } from '../../lib/session.js';

const QuerySchema = z.object({
  url: z.string().url(),
});

const PRIVATE_HOSTNAMES = new Set(['localhost', '0.0.0.0', '::1']);

function isPrivateHostname(hostname: string) {
  if (PRIVATE_HOSTNAMES.has(hostname.toLowerCase())) return true;
  return (
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

function extractDomain(rawUrl: string) {
  return new URL(rawUrl).hostname.replace(/^www\./i, '').toLowerCase();
}

function prettyNameFromDomain(domain: string) {
  const labels = domain.split('.').filter(Boolean);
  const label = labels.length > 1 ? labels[labels.length - 2] : labels[0];
  if (!label) return domain;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function resolveAbsoluteUrl(href: string, base: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function extractMetaContent(head: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = head.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function parseHtmlMetadata(html: string, pageUrl: string) {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const head = headMatch ? headMatch[1] : html.slice(0, 20_000);

  const name = extractMetaContent(head, [
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  ]);

  const iconHref = extractMetaContent(head, [
    /<link[^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["']/i,
  ]);

  const faviconUrl = iconHref ? resolveAbsoluteUrl(iconHref, pageUrl) : null;

  return { name: name ? decodeHtmlEntities(name) : null, faviconUrl };
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function logoDevFallback(domain: string) {
  const key = getEnv('VITE_LOGO_DEV_TOKEN');
  if (!key) return null;
  const params = new URLSearchParams({ token: key, size: '64', format: 'png', fallback: '404' });
  return `https://img.logo.dev/${encodeURIComponent(domain)}?${params.toString()}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session) return;

  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const pageUrl = parsed.data.url;
  let hostname: string;
  try {
    const parsedUrl = new URL(pageUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Unsupported protocol' });
    }
    hostname = parsedUrl.hostname;
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (isPrivateHostname(hostname)) {
    return res.status(400).json({ error: 'URL not allowed' });
  }

  const domain = extractDomain(pageUrl);
  const fallback = { name: prettyNameFromDomain(domain), faviconUrl: logoDevFallback(domain), domain };

  try {
    const resp = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobLogBot/1.0)' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) return res.status(200).json(fallback);

    const html = await resp.text();
    const { name, faviconUrl } = parseHtmlMetadata(html, pageUrl);

    return res.status(200).json({
      name: name || fallback.name,
      faviconUrl: faviconUrl || fallback.faviconUrl,
      domain,
    });
  } catch {
    return res.status(200).json(fallback);
  }
}
