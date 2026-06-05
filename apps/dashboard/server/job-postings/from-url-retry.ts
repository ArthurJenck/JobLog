import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSession } from '../../lib/session.js';
import {
  UrlScrapeHttpError,
  parseRetryRequest,
  retryApplicationFromUrl,
} from './url-scrape-service.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const parsed = parseRetryRequest(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const result = await retryApplicationFromUrl(session.user.id, parsed.data.applicationId);
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof UrlScrapeHttpError) {
      return res.status(err.status).json({
        code: err.code,
        error: err.message,
        usage: err.usage,
        extensionUrl: err.extensionUrl,
      });
    }

    console.error('[job-postings/from-url/retry] unhandled error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
