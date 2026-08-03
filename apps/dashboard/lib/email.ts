import { normalizeFrequencyDays } from '@joblog/shared';
import type { CreateEmailOptions } from 'resend';
import { escapeHtml } from './html.js';
import { getEnv } from './env.js';
import { MAX_BULK_SNOOZE_IDS, signBulkSnoozeToken, signSnoozeToken } from './snooze.js';

export const MAX_DIGEST_ITEMS = MAX_BULK_SNOOZE_IDS;

export interface ReminderDigestItem {
  applicationId: string;
  jobTitle: string;
  company: string;
  frequencyDays?: number;
}

function getAppUrl() {
  return getEnv('PUBLIC_APP_URL') ?? 'https://joblog.arthurjenck.com';
}

function buildAppUrl(params: Record<string, string>) {
  const url = new URL('/', getAppUrl());
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function buildSnoozeUrl(token: string) {
  const url = new URL('/api/snooze', getAppUrl());
  url.searchParams.set('token', token);
  return url.toString();
}

function formatSnoozeDelay(days: number) {
  return days === 1 ? 'demain' : `dans ${days} jours`;
}

function subjectSafe(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

const LINK_STYLE =
  'color:#7b6f62;font-size:13px;text-decoration:underline;text-underline-offset:3px';
const BUTTON_STYLE =
  'display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:13px 18px;border-radius:10px;font-size:14px;font-weight:650';
const CARD_STYLE =
  'margin:0 0 14px;padding:20px;border-radius:14px;background:#f7f3ea;border:1px solid #e7dece';

function renderShell(inner: string) {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;background:#f3f1ec;padding:32px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171717">
  <div style="max-width:560px;margin:0 auto">
    <div style="background:#fffdf8;border:1px solid #ded8cd;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(38,31,23,0.10)">
      <div style="height:6px;background:#171717"></div>
      <div style="padding:34px 34px 30px">
${inner}
      </div>
    </div>

    <p style="margin:18px 6px 0;color:#968b7e;font-size:12px;line-height:1.6">
      Tu reçois cet email car un rappel est actif dans JobLog.
      <a href="${new URL('/settings', getAppUrl()).toString()}" style="color:#756a5f">Gérer mes préférences</a>
    </p>
  </div>
</body>
</html>`;
}

function renderSingle(item: ReminderDigestItem, userId: string) {
  const snoozeDays = normalizeFrequencyDays(item.frequencyDays);
  const snoozeUrl = buildSnoozeUrl(
    signSnoozeToken(item.applicationId, userId, snoozeDays)
  );

  return `
        <h1 style="margin:0;color:#171717;font-size:26px;line-height:1.15;font-weight:650;letter-spacing:-0.02em">
          Il est temps de reprendre contact.
        </h1>

        <div style="margin:26px 0;padding:20px;border-radius:14px;background:#f7f3ea;border:1px solid #e7dece">
          <p style="margin:0 0 8px;color:#73685d;font-size:13px">Candidature suivie</p>
          <p style="margin:0;color:#171717;font-size:18px;line-height:1.35;font-weight:650">
            ${escapeHtml(item.jobTitle)}
          </p>
          <p style="margin:7px 0 0;color:#5f574f;font-size:15px">
            ${escapeHtml(item.company)}
          </p>
        </div>

        <p style="margin:0 0 24px;color:#4a4540;font-size:15px;line-height:1.7">
          Ne te fais pas oublier ! Prépare une relance pour augmenter tes chances de recevoir une réponse.
        </p>

        <div style="margin:0 0 22px">
          <a href="${buildAppUrl({ applicationId: item.applicationId })}" style="${BUTTON_STYLE}">
            Voir la candidature
          </a>
        </div>

        <a href="${snoozeUrl}" style="${LINK_STYLE}">
          Me rappeler ${escapeHtml(formatSnoozeDelay(snoozeDays))}
        </a>`;
}

function renderCard(item: ReminderDigestItem, userId: string) {
  const snoozeDays = normalizeFrequencyDays(item.frequencyDays);
  const snoozeUrl = buildSnoozeUrl(
    signSnoozeToken(item.applicationId, userId, snoozeDays)
  );

  return `
        <div style="${CARD_STYLE}">
          <p style="margin:0;color:#171717;font-size:17px;line-height:1.35;font-weight:650">
            ${escapeHtml(item.jobTitle)}
          </p>
          <p style="margin:6px 0 14px;color:#5f574f;font-size:14px">
            ${escapeHtml(item.company)}
          </p>
          <a href="${buildAppUrl({ applicationId: item.applicationId })}" style="${BUTTON_STYLE};padding:10px 15px;font-size:13px">
            Voir
          </a>
          <a href="${snoozeUrl}" style="${LINK_STYLE};margin-left:14px">
            Me rappeler ${escapeHtml(formatSnoozeDelay(snoozeDays))}
          </a>
        </div>`;
}

function renderDigest(items: ReminderDigestItem[], userId: string, overflow: number) {
  const frequencies = new Set(items.map((item) => normalizeFrequencyDays(item.frequencyDays)));
  const bulkDays = frequencies.size === 1 ? [...frequencies][0] : undefined;
  const bulkUrl = buildSnoozeUrl(
    signBulkSnoozeToken(
      userId,
      items.map((item) => item.applicationId),
      bulkDays ?? Math.max(...frequencies)
    )
  );
  const bulkLabel = bulkDays
    ? `Tout reporter ${escapeHtml(formatSnoozeDelay(bulkDays))}`
    : 'Tout reporter';

  const overflowRow = overflow
    ? `
        <p style="margin:0 0 22px;color:#73685d;font-size:14px">
          + ${overflow} autre${overflow > 1 ? 's' : ''} relance${overflow > 1 ? 's' : ''} —
          <a href="${buildAppUrl({})}" style="color:#756a5f">voir toutes mes candidatures</a>
        </p>`
    : '';

  return `
        <h1 style="margin:0;color:#171717;font-size:26px;line-height:1.15;font-weight:650;letter-spacing:-0.02em">
          Il est temps de reprendre contact.
        </h1>

        <p style="margin:16px 0 26px;color:#4a4540;font-size:15px;line-height:1.7">
          Tu as ${items.length + overflow} relances à faire aujourd'hui. Ne te fais pas oublier !
        </p>
${items.map((item) => renderCard(item, userId)).join('')}
${overflowRow}
        <p style="margin:22px 0 0">
          <a href="${bulkUrl}" style="${LINK_STYLE}">
            ${bulkLabel}
          </a>
        </p>`;
}

export function buildReminderDigestEmail({
  to,
  userId,
  items,
}: {
  to: string;
  userId: string;
  items: ReminderDigestItem[];
}): CreateEmailOptions {
  if (items.length === 0) {
    throw new Error('buildReminderDigestEmail requires at least one item');
  }

  const visible = items.slice(0, MAX_DIGEST_ITEMS);
  const overflow = items.length - visible.length;

  const from =
    getEnv('RESEND_REMINDER_FROM') ??
    getEnv('RESEND_FROM') ??
    'JobLog <noreply@arthurjenck.com>';

  if (items.length === 1) {
    const [item] = visible;
    return {
      from,
      to,
      subject: subjectSafe(`Relance — ${item.jobTitle} chez ${item.company}`),
      html: renderShell(renderSingle(item, userId)),
    };
  }

  return {
    from,
    to,
    subject: `${items.length} relances à faire`,
    html: renderShell(renderDigest(visible, userId, overflow)),
  };
}
