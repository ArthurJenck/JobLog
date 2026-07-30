import { z } from 'zod';
import { getEnv } from '../../lib/env.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';
import { safeFetch } from '../../lib/safe-fetch.js';

const QuerySchema = z.object({
  url: z.string().url(),
});

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

export default defineHandler({
  GET: method({
    query: QuerySchema,
    rateLimit: {
      max: 30,
      windowMs: 60 * 1000,
      scope: ({ user }) => `metadata:${user!.id}`,
    },
    async handle({ query }) {
      const pageUrl = query.url;
      try {
        const parsedUrl = new URL(pageUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw ApiError.badRequest('Unsupported protocol');
        }
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw ApiError.badRequest('Invalid URL');
      }

      const domain = extractDomain(pageUrl);
      const fallback = { name: prettyNameFromDomain(domain), faviconUrl: logoDevFallback(domain), domain };

      try {
        const resp = await safeFetch(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobLogBot/1.0)' },
          timeoutMs: 8_000,
        });
        if (!resp.ok) return { json: fallback };

        const html = await resp.text();
        const { name, faviconUrl } = parseHtmlMetadata(html, pageUrl);

        return {
          json: {
            name: name || fallback.name,
            faviconUrl: faviconUrl || fallback.faviconUrl,
            domain,
          },
        };
      } catch {
        return { json: fallback };
      }
    },
  }),
});
