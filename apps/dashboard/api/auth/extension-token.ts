import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { requireSession } from '../../lib/session.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session) return;

  const token = jwt.sign(
    { sub: session.user.id, email: session.user.email },
    process.env.BETTER_AUTH_SECRET!,
    { expiresIn: '90d' }
  );

  return res.status(200).json({ token });
}
