import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fromNodeHeaders } from 'better-auth/node';
import { getAuth } from './auth.js';

export async function requireSession(req: VercelRequest, res: VercelResponse) {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: 'Non authentifié' });
    return null;
  }
  return session;
}
