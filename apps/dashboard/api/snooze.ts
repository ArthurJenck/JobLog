import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getCollection } from '../lib/db.js';
import { getEnv } from '../lib/env.js';
import { verifySnoozeToken } from '../lib/snooze.js';

function buildAppUrl(params: Record<string, string>) {
  const appUrl = getEnv('PUBLIC_APP_URL') ?? 'https://joblog.arthurjenck.com';
  const url = new URL('/', appUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function normalizeFrequencyDays(value: unknown) {
  const days = Number(value);
  return Number.isFinite(days) && days > 0 ? Math.trunc(days) : 7;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query as { token?: string };
  if (!token) return res.status(400).send('Token manquant.');

  const payload = verifySnoozeToken(token);
  if (!payload) return res.status(400).send('Lien invalide ou expiré.');
  if (!ObjectId.isValid(payload.applicationId)) return res.status(400).send('Lien invalide.');

  const col = await getCollection('applications');
  const appFilter = { _id: new ObjectId(payload.applicationId), userId: payload.userId };
  const app = await col.findOne(appFilter, { projection: { reminder: 1 } }) as {
    reminder?: { frequencyDays?: unknown };
  } | null;
  if (!app) return res.status(404).send('Candidature introuvable.');

  const frequencyDays = normalizeFrequencyDays(app.reminder?.frequencyDays);
  const snoozedUntil = new Date(Date.now() + frequencyDays * 24 * 60 * 60 * 1000);

  const result = await col.updateOne(
    appFilter,
    { $set: { 'reminder.snoozedUntil': snoozedUntil, updated_at: new Date() } }
  );

  if (result.matchedCount === 0) return res.status(404).send('Candidature introuvable.');

  res.writeHead(302, {
    Location: buildAppUrl({
      applicationId: payload.applicationId,
      toast: 'reminder-snoozed',
      snoozeDays: String(frequencyDays),
    }),
  });
  res.end();
}
