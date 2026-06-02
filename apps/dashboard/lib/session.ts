import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fromNodeHeaders } from 'better-auth/node';
import jwt from 'jsonwebtoken';
import { getAuth } from './auth.js';

interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}

export async function requireSession(
  req: VercelRequest,
  res: VercelResponse
): Promise<{ user: SessionUser } | null> {
  const authHeader = req.headers['authorization'];

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, process.env.BETTER_AUTH_SECRET!) as { sub: string; email: string };
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

  return { user: { id: session.user.id, email: session.user.email, name: session.user.name } };
}
