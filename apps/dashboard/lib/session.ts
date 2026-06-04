import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fromNodeHeaders } from 'better-auth/node';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getAuth } from './auth.js';
import { getCollection } from './db.js';

interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}

async function touchLastActive(userId: string) {
  const dayAgo = new Date(Date.now() - 86_400_000);
  const col = await getCollection('user');
  await col.updateOne(
    {
      _id: new ObjectId(userId),
      $or: [{ lastActiveAt: { $lt: dayAgo } }, { lastActiveAt: { $exists: false } }],
    },
    { $set: { lastActiveAt: new Date() }, $unset: { inactivityWarnedAt: '' } }
  );
}

export async function requireSession(
  req: VercelRequest,
  res: VercelResponse
): Promise<{ user: SessionUser } | null> {
  const authHeader = req.headers['authorization'];

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, process.env.BETTER_AUTH_SECRET!) as {
        sub: string;
        email: string;
        type?: string;
      };
      if (payload.type && payload.type !== 'access') {
        res.status(401).json({ error: 'Token invalide' });
        return null;
      }
      await touchLastActive(payload.sub);
      return { user: { id: payload.sub, email: payload.email } };
    } catch {
      res.status(401).json({ error: 'Token invalide' });
      return null;
    }
  }

  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: 'Non authentifié' });
    return null;
  }

  await touchLastActive(session.user.id);
  return { user: { id: session.user.id, email: session.user.email, name: session.user.name } };
}
