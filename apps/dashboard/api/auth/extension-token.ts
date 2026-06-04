import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';

const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session) return;

  const userId = session.user.id;

  const accessToken = jwt.sign(
    { sub: userId, email: session.user.email, type: 'access' },
    process.env.BETTER_AUTH_SECRET!,
    { expiresIn: '1d' }
  );

  const refreshToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(refreshToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_TTL_MS);

  const col = await getCollection('extension_tokens');
  await col.insertOne({ userId, tokenHash, createdAt: now, expiresAt, lastUsedAt: now });

  return res.status(200).json({ accessToken, refreshToken });
}
