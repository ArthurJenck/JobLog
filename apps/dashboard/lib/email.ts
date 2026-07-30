import { normalizeFrequencyDays } from '@joblog/shared';
import { escapeHtml } from './html.js';
import { sendEmail } from './resend.js';
import { getEnv } from './env.js';
import { signSnoozeToken } from './snooze.js';

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

function formatSnoozeDelay(days: number) {
  return days === 1 ? 'demain' : `dans ${days} jours`;
}

export async function sendReminderEmail({
  to,
  applicationId,
  userId,
  jobTitle,
  company,
  frequencyDays,
}: {
  to: string;
  applicationId: string;
  userId: string;
  jobTitle: string;
  company: string;
  frequencyDays?: number;
}) {
  const snoozeDays = normalizeFrequencyDays(frequencyDays);
  const snoozeToken = signSnoozeToken(applicationId, userId);
  const dashboardUrl = buildAppUrl({ applicationId });
  const snoozeUrl = new URL('/api/snooze', getAppUrl());
  snoozeUrl.searchParams.set('token', snoozeToken);
  const safeJobTitle = escapeHtml(jobTitle);
  const safeCompany = escapeHtml(company);
  const snoozeLabel = escapeHtml(formatSnoozeDelay(snoozeDays));

  return sendEmail({
    from:
      getEnv('RESEND_REMINDER_FROM') ??
      getEnv('RESEND_FROM') ??
      'JobLog <noreply@arthurjenck.com>',
    to,
    subject: `Relance — ${jobTitle} chez ${company}`,
    html: `
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
        <h1 style="margin:0;color:#171717;font-size:26px;line-height:1.15;font-weight:650;letter-spacing:-0.02em">
          Il est temps de reprendre contact.
        </h1>

        <div style="margin:26px 0;padding:20px;border-radius:14px;background:#f7f3ea;border:1px solid #e7dece">
          <p style="margin:0 0 8px;color:#73685d;font-size:13px">Candidature suivie</p>
          <p style="margin:0;color:#171717;font-size:18px;line-height:1.35;font-weight:650">
            ${safeJobTitle}
          </p>
          <p style="margin:7px 0 0;color:#5f574f;font-size:15px">
            ${safeCompany}
          </p>
        </div>

        <p style="margin:0 0 24px;color:#4a4540;font-size:15px;line-height:1.7">
          Ne te fais pas oublier ! Prépare une relance pour augmenter tes chances de recevoir une réponse.
        </p>

        <div style="margin:0 0 22px">
          <a href="${dashboardUrl}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:13px 18px;border-radius:10px;font-size:14px;font-weight:650">
            Voir la candidature
          </a>
        </div>

        <a href="${snoozeUrl.toString()}" style="color:#7b6f62;font-size:13px;text-decoration:underline;text-underline-offset:3px">
          Me rappeler ${snoozeLabel}
        </a>
      </div>
    </div>

    <p style="margin:18px 6px 0;color:#968b7e;font-size:12px;line-height:1.6">
      Tu reçois cet email car un rappel est actif dans JobLog.
      <a href="${new URL('/settings', getAppUrl()).toString()}" style="color:#756a5f">Gérer mes préférences</a>
    </p>
  </div>
</body>
</html>`,
  });
}
