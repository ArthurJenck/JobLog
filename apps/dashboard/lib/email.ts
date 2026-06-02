import { Resend } from 'resend';
import { signSnoozeToken } from './snooze.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.PUBLIC_APP_URL ?? 'https://joblog.arthurjenck.com';

export async function sendReminderEmail({
  to,
  applicationId,
  userId,
  jobTitle,
  company,
}: {
  to: string;
  applicationId: string;
  userId: string;
  jobTitle: string;
  company: string;
}) {
  const snoozeToken = signSnoozeToken(applicationId, userId);
  const dashboardUrl = `${APP_URL}/`;
  const snoozeUrl = `${APP_URL}/api/snooze?token=${snoozeToken}`;

  await resend.emails.send({
    from: 'JobLog <relances@arthurjenck.com>',
    to,
    subject: `Relance — ${jobTitle} chez ${company}`,
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;margin:0;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
      <div style="width:32px;height:32px;background:#0f0f0f;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px">JL</div>
      <span style="font-weight:600;font-size:16px">JobLog</span>
    </div>
    <h2 style="font-size:18px;font-weight:600;margin:0 0 8px;color:#111">Il est temps de relancer</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px">
      Tu as candidaté pour le poste <strong>${jobTitle}</strong> chez <strong>${company}</strong>.<br>
      Tu n'as pas encore eu de réponse — veux-tu envoyer une relance ?
    </p>
    <a href="${dashboardUrl}" style="display:inline-block;background:#0f0f0f;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500;margin-bottom:12px">
      Voir ma candidature
    </a>
    <br>
    <a href="${snoozeUrl}" style="color:#888;font-size:13px;text-decoration:none">
      Me rappeler dans 7 jours
    </a>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="color:#aaa;font-size:12px;margin:0">
      Tu reçois cet email car tu utilises JobLog.
      <a href="${APP_URL}/settings" style="color:#aaa">Gérer mes préférences</a>
    </p>
  </div>
</body>
</html>`,
  });
}
