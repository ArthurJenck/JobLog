import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getCollection } from '../lib/db.js';
import { requireSession } from '../lib/session.js';
import { getAuth } from '../lib/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session) return;

  const userId = session.user.id;

  const cvsCol = await getCollection('cvs');
  const userCvs = await cvsCol
    .find({ userId }, { projection: { content_hash: 1 } })
    .toArray();
  const cvHashes = userCvs
    .map((cv) => cv.content_hash as string | undefined)
    .filter((hash): hash is string => typeof hash === 'string' && hash.length > 0);

  await Promise.all([
    getCollection('applications').then((col) => col.deleteMany({ userId })),
    cvsCol.deleteMany({ userId }),
    getCollection('notification_settings').then((col) => col.deleteMany({ userId })),
    cvHashes.length
      ? getCollection('cv_analyses').then((col) => col.deleteMany({ cvHash: { $in: cvHashes } }))
      : Promise.resolve(),
  ]);

  try {
    const auth = await getAuth();
    await auth.api.deleteUser({ headers: fromNodeHeaders(req.headers), body: {} });
  } catch {
    try {
      const userCol = await getCollection('user');
      await userCol.deleteOne({ _id: new ObjectId(userId) });
    } catch { /* best-effort */ }
  }

  res.setHeader('Set-Cookie', 'better-auth.session_token=; Max-Age=0; Path=/');
  return res.status(200).json({ ok: true });
}
