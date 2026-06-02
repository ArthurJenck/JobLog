import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session) return;

  const col = await getCollection('applications');
  const now = new Date();

  const count = await col.countDocuments({
    userId: session.user.id,
    'reminder.at': { $lte: now },
    $expr: { $lt: ['$reminder.sentCount', '$reminder.maxCount'] },
    $or: [
      { 'reminder.snoozedUntil': null },
      { 'reminder.snoozedUntil': { $lte: now } },
    ],
    status: { $nin: ['rejected', 'ghosted', 'offer'] },
  });

  return res.status(200).json({ count });
}
