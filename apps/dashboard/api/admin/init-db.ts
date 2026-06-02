import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureIndexes } from '../../lib/db-init.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  await ensureIndexes();
  return res.status(200).json({ ok: true });
}
