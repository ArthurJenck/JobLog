import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session) return;

  const col = await getCollection('applications');
  const pipeline = [
    { $match: { userId: session.user.id } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ];

  const results = await col.aggregate<{ _id: string; count: number }>(pipeline).toArray();
  const stats: Record<string, number> = {};
  let total = 0;
  for (const r of results) {
    stats[r._id] = r.count;
    total += r.count;
  }

  return res.status(200).json({ total, ...stats });
}
