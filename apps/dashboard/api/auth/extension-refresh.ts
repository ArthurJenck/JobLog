import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getCollection } from '../../lib/db.js';

const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken requis' });

  const tokenHash = hashToken(refreshToken);
  const col = await getCollection('extension_tokens');

  const doc = await col.findOne({ tokenHash });

  if (!doc || doc.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }

  const userCol = await getCollection('user');
  const user = await userCol.findOne({ _id: new ObjectId(String(doc.userId)) });
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });

  const newRefreshToken = randomBytes(32).toString('hex');
  const newHash = hashToken(newRefreshToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_TTL_MS);

  await col.replaceOne(
    { tokenHash },
    { userId: doc.userId, tokenHash: newHash, createdAt: doc.createdAt, expiresAt, lastUsedAt: now }
  );

  const accessToken = jwt.sign(
    { sub: String(doc.userId), email: String(user.email), type: 'access' },
    process.env.BETTER_AUTH_SECRET!,
    { expiresIn: '1d' }
  );

  return res.status(200).json({ accessToken, refreshToken: newRefreshToken });
}
