import { normalizeFrequencyDays } from '@joblog/shared';
import { ObjectId } from 'mongodb';
import { getCollection } from '../lib/db.js';
import { getEnv } from '../lib/env.js';
import { defineHandler, method } from '../lib/http/define-handler.js';
import { verifySnoozeToken } from '../lib/snooze.js';

function buildAppUrl(params: Record<string, string>) {
  const appUrl = getEnv('PUBLIC_APP_URL') ?? 'https://joblog.arthurjenck.com';
  const url = new URL('/', appUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export default defineHandler({
  GET: method({
    auth: 'public',
    async handle({ req, res }) {
      const { token } = req.query as { token?: string };
      if (!token) {
        res.status(400).send('Token manquant.');
        return;
      }

      const payload = verifySnoozeToken(token);
      if (!payload) {
        res.status(400).send('Lien invalide ou expiré.');
        return;
      }
      if (!ObjectId.isValid(payload.applicationId)) {
        res.status(400).send('Lien invalide.');
        return;
      }

      const col = await getCollection('applications');
      const appFilter = { _id: new ObjectId(payload.applicationId), userId: payload.userId };
      const app = await col.findOne(appFilter, { projection: { reminder: 1 } }) as {
        reminder?: { frequencyDays?: unknown };
      } | null;
      if (!app) {
        res.status(404).send('Candidature introuvable.');
        return;
      }

      const frequencyDays = normalizeFrequencyDays(app.reminder?.frequencyDays);
      const snoozedUntil = new Date(Date.now() + frequencyDays * 24 * 60 * 60 * 1000);

      const result = await col.updateOne(
        appFilter,
        { $set: { 'reminder.snoozedUntil': snoozedUntil, updated_at: new Date() } }
      );

      if (result.matchedCount === 0) {
        res.status(404).send('Candidature introuvable.');
        return;
      }

      res.writeHead(302, {
        Location: buildAppUrl({
          applicationId: payload.applicationId,
          toast: 'reminder-snoozed',
          snoozeDays: String(frequencyDays),
        }),
      });
      res.end();
    },
  }),
});
