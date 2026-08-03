import { normalizeFrequencyDays } from '@joblog/shared';
import { ObjectId, type AnyBulkWriteOperation, type Document } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../lib/db.js';
import { getEnv } from '../lib/env.js';
import { escapeHtml } from '../lib/html.js';
import { defineHandler, method } from '../lib/http/define-handler.js';
import { getClientIp } from '../lib/rate-limit.js';
import { verifySnoozeToken, type SnoozePayload } from '../lib/snooze.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface SnoozeApplicationDoc {
  _id: ObjectId;
  userId: string;
  jobPostingId?: string;
  reminder?: { frequencyDays?: unknown };
}

const BodySchema = z.object({ token: z.string().min(1) });

const rateLimitScope =
  (prefix: string) =>
  ({ req }: { req: VercelRequest }) =>
    `${prefix}:${getClientIp(req)}`;

function buildAppUrl(params: Record<string, string>) {
  const appUrl = getEnv('PUBLIC_APP_URL') ?? 'https://joblog.arthurjenck.com';
  const url = new URL('/', appUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function renderPage(res: VercelResponse, status: number, title: string, inner: string) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)} — JobLog</title>
</head>
<body style="margin:0;background:#f3f1ec;padding:48px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171717">
  <div style="max-width:460px;margin:0 auto;background:#fffdf8;border:1px solid #ded8cd;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(38,31,23,0.10)">
    <div style="height:6px;background:#171717"></div>
    <div style="padding:34px">
${inner}
    </div>
  </div>
</body>
</html>`);
}

function renderError(res: VercelResponse, status: number, message: string) {
  renderPage(
    res,
    status,
    'Lien indisponible',
    `      <h1 style="margin:0 0 14px;font-size:22px;font-weight:650;letter-spacing:-0.02em">Lien indisponible</h1>
      <p style="margin:0 0 24px;color:#4a4540;font-size:15px;line-height:1.7">${escapeHtml(message)}</p>
      <a href="${buildAppUrl({})}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:13px 18px;border-radius:10px;font-size:14px;font-weight:650">Ouvrir JobLog</a>`
  );
}

async function loadApplications(payload: SnoozePayload) {
  const ids = (payload.kind === 'bulk' ? payload.applicationIds : [payload.applicationId]).filter(
    (id) => ObjectId.isValid(id)
  );
  if (ids.length === 0) return [];

  const col = await getCollection<SnoozeApplicationDoc>('applications');
  return col
    .find(
      { _id: { $in: ids.map((id) => new ObjectId(id)) }, userId: payload.userId },
      { projection: { reminder: 1, jobPostingId: 1 } }
    )
    .toArray();
}

async function describeApplications(apps: SnoozeApplicationDoc[]) {
  const ids = apps
    .map((app) => app.jobPostingId)
    .filter((id): id is string => typeof id === 'string' && ObjectId.isValid(id));

  const col = await getCollection<{ _id: ObjectId; title?: string; company?: string }>(
    'job_postings'
  );
  const docs = await col
    .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }, { projection: { title: 1, company: 1 } })
    .toArray();
  const byId = new Map(docs.map((doc) => [doc._id.toString(), doc]));

  return apps.map((app) => {
    const jp = app.jobPostingId ? byId.get(app.jobPostingId) : undefined;
    return [jp?.title, jp?.company].filter(Boolean).join(' — ') || 'Candidature';
  });
}

function formatDelay(days: number) {
  return days === 1 ? 'de 1 jour' : `de ${days} jours`;
}

export default defineHandler({
  GET: method({
    auth: 'public',
    rateLimit: { max: 30, windowMs: 60_000, scope: rateLimitScope('snooze-view') },
    async handle({ req, res }) {
      const { token } = req.query as { token?: string };
      if (!token) {
        renderError(res, 400, 'Ce lien ne contient aucun jeton.');
        return;
      }

      const payload = verifySnoozeToken(token);
      if (!payload) {
        renderError(res, 400, 'Ce lien est invalide ou a expiré.');
        return;
      }

      const apps = await loadApplications(payload);
      if (apps.length === 0) {
        renderError(res, 404, "Cette candidature n'existe plus.");
        return;
      }

      const labels = await describeApplications(apps);
      const frequencies = new Set(
        apps.map((app) => normalizeFrequencyDays(app.reminder?.frequencyDays as number | undefined))
      );
      const delay = frequencies.size === 1 ? ` ${formatDelay([...frequencies][0])}` : '';

      const heading =
        apps.length === 1
          ? `Reporter ce rappel${delay} ?`
          : `Reporter ces ${apps.length} rappels${delay} ?`;

      renderPage(
        res,
        200,
        'Reporter le rappel',
        `      <h1 style="margin:0 0 18px;font-size:22px;font-weight:650;letter-spacing:-0.02em">${escapeHtml(heading)}</h1>
      <ul style="margin:0 0 26px;padding:0 0 0 18px;color:#4a4540;font-size:15px;line-height:1.8">
${labels.map((label) => `        <li>${escapeHtml(label)}</li>`).join('\n')}
      </ul>
      <form method="POST" action="/api/snooze" style="margin:0">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <button type="submit" style="border:0;cursor:pointer;background:#171717;color:#fff;padding:13px 18px;border-radius:10px;font-size:14px;font-weight:650;font-family:inherit">Confirmer le report</button>
      </form>
      <p style="margin:22px 0 0;font-size:13px">
        <a href="${buildAppUrl({})}" style="color:#7b6f62;text-decoration:underline;text-underline-offset:3px">Annuler et ouvrir JobLog</a>
      </p>`
      );
    },
  }),

  POST: method({
    auth: 'public',
    body: BodySchema,
    rateLimit: { max: 10, windowMs: 60_000, scope: rateLimitScope('snooze-confirm') },
    async handle({ body, res }) {
      const payload = verifySnoozeToken(body.token);
      if (!payload) {
        renderError(res, 400, 'Ce lien est invalide ou a expiré.');
        return;
      }

      const apps = await loadApplications(payload);
      if (apps.length === 0) {
        renderError(res, 404, "Cette candidature n'existe plus.");
        return;
      }

      const now = Date.now();
      const operations: AnyBulkWriteOperation<Document>[] = apps.map((app) => {
        const frequencyDays = normalizeFrequencyDays(
          app.reminder?.frequencyDays as number | undefined
        );
        return {
          updateOne: {
            filter: { _id: app._id, userId: payload.userId },
            update: {
              $set: {
                'reminder.snoozedUntil': new Date(now + frequencyDays * 24 * 60 * 60 * 1000),
                updated_at: new Date(),
              },
            },
          },
        };
      });

      const col = await getCollection('applications');
      await col.bulkWrite(operations);

      const search: Record<string, string> =
        payload.kind === 'bulk'
          ? { toast: 'reminders-snoozed', snoozeCount: String(apps.length) }
          : {
              applicationId: apps[0]._id.toString(),
              toast: 'reminder-snoozed',
              snoozeDays: String(
                normalizeFrequencyDays(apps[0].reminder?.frequencyDays as number | undefined)
              ),
            };

      res.writeHead(302, { Location: buildAppUrl(search) });
      res.end();
    },
  }),
});
