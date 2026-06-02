import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getCollection } from '../lib/db.js';
import { verifySnoozeToken } from '../lib/snooze.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query as { token?: string };
  if (!token) return res.status(400).send('Token manquant.');

  const payload = verifySnoozeToken(token);
  if (!payload) return res.status(400).send('Lien invalide ou expiré.');

  const col = await getCollection('applications');
  const snoozedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await col.updateOne(
    { _id: new ObjectId(payload.applicationId), userId: payload.userId },
    { $set: { 'reminder.snoozedUntil': snoozedUntil, updated_at: new Date() } }
  );

  const appUrl = process.env.PUBLIC_APP_URL ?? 'https://joblog.arthurjenck.com';
  res.writeHead(302, { Location: appUrl });
  res.end();
}
