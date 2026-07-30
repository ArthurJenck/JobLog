import { getParisDateKey, getParisMonthKey, normalizeFrequencyDays, REMINDER_ELIGIBLE_STATUSES } from '@joblog/shared';
import { ObjectId, type Filter } from 'mongodb';
import { getCollection } from '../../lib/db.js';
import { getEnv } from '../../lib/env.js';
import { sendReminderEmail } from '../../lib/email.js';
import { escapeHtml } from '../../lib/html.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { sendEmail } from '../../lib/resend.js';
import { FIRECRAWL_MONTHLY_SOFT_CAP, getJinaAlertThreshold } from '../usage/provider-usage.js';

interface ReminderApplicationDoc {
  userId: string;
  jobPostingId: string;
  reminder?: {
    frequencyDays?: number;
    sentCount?: number;
    maxCount?: number;
    at?: Date;
    snoozedUntil?: Date | null;
  };
  status: string;
}

interface ReminderUserDoc {
  email?: string;
}

interface ReminderNotificationDoc {
  userId: string;
  email?: boolean;
  push?: boolean;
  vapidSubscription?: PushSubscription;
}

interface ReminderJobPostingDoc {
  title?: string;
  company?: string;
}

interface JinaUsageDoc {
  date: string;
  keyHash: string;
  calls: number;
  estimatedTokens: number;
  lastErrorCode?: string;
  alertedAt: Date | null;
}

interface FirecrawlUsageDoc {
  month: string;
  calls: number;
  lastErrorCode?: string;
  alertedAt: Date | null;
}

interface PushSubscription {
  endpoint: string;
  keys: { auth: string; p256dh: string };
}

async function sendWebPush(
  subscription: PushSubscription,
  payload: { title: string; body: string; url: string }
) {
  const { sendNotification, setVapidDetails } = await import('web-push');

  setVapidDetails(
    process.env.ADMIN_MAIL!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  await sendNotification(subscription, JSON.stringify(payload));
}

async function checkJinaUsageAlerts() {
  const to = getEnv('JINA_ALERT_EMAIL');
  if (!to) return { checked: true, sent: 0, skipped: 'missing_jina_alert_email' };

  const col = await getCollection<JinaUsageDoc>('jina_usage');
  const date = getParisDateKey();
  const threshold = getJinaAlertThreshold();
  const alertDocs = await col.find({
    date,
    alertedAt: null,
    $or: [
      { estimatedTokens: { $gte: threshold } },
      { lastErrorCode: { $in: ['jina_auth_error', 'jina_balance_error'] } },
    ],
  }).toArray();

  if (alertDocs.length === 0) return { checked: true, sent: 0 };

  const rows = alertDocs.map((doc) => {
    const tokens = Number(doc.estimatedTokens ?? 0).toLocaleString('fr-FR');
    const calls = Number(doc.calls ?? 0).toLocaleString('fr-FR');
    const keyHash = escapeHtml(String(doc.keyHash ?? 'unknown'));
    const lastError = doc.lastErrorCode ? escapeHtml(String(doc.lastErrorCode)) : 'aucune';
    return `<li><strong>${keyHash}</strong> - ${tokens} tokens estimés, ${calls} appels, dernière erreur: ${lastError}</li>`;
  }).join('');

  await sendEmail({
    from: getEnv('RESEND_ALERT_FROM') ?? getEnv('RESEND_FROM') ?? 'JobLog <noreply@arthurjenck.com>',
    to,
    subject: `JobLog - alerte Jina ${date}`,
    html: `
<p>Une alerte Jina a été détectée pour JobLog.</p>
<ul>${rows}</ul>
<p>Seuil configuré: ${threshold.toLocaleString('fr-FR')} tokens estimés.</p>
`,
  });

  await col.updateMany(
    { _id: { $in: alertDocs.map((doc) => doc._id) } },
    { $set: { alertedAt: new Date() } },
  );

  return { checked: true, sent: 1 };
}

async function checkFirecrawlUsageAlerts() {
  const to = getEnv('JINA_ALERT_EMAIL');
  if (!to) return { checked: true, sent: 0, skipped: 'missing_jina_alert_email' };

  const col = await getCollection<FirecrawlUsageDoc>('firecrawl_usage');
  const month = getParisMonthKey();
  const doc = await col.findOne({
    month,
    alertedAt: null,
    $or: [
      { calls: { $gte: FIRECRAWL_MONTHLY_SOFT_CAP } },
      { lastErrorCode: { $in: ['firecrawl_auth_error', 'firecrawl_quota_exhausted'] } },
    ],
  });

  if (!doc) return { checked: true, sent: 0 };

  const calls = Number(doc.calls ?? 0).toLocaleString('fr-FR');
  const lastError = doc.lastErrorCode ? escapeHtml(String(doc.lastErrorCode)) : 'aucune';

  await sendEmail({
    from: getEnv('RESEND_ALERT_FROM') ?? getEnv('RESEND_FROM') ?? 'JobLog <noreply@arthurjenck.com>',
    to,
    subject: `JobLog - alerte Firecrawl ${month}`,
    html: `
<p>Le quota mensuel gratuit Firecrawl approche de sa limite pour JobLog.</p>
<p>${calls} appels ce mois-ci, dernière erreur: ${lastError}.</p>
<p>Seuil configuré: ${FIRECRAWL_MONTHLY_SOFT_CAP.toLocaleString('fr-FR')} appels. Les scrapes basculent automatiquement sur Jina au-delà.</p>
`,
  });

  await col.updateOne({ _id: doc._id }, { $set: { alertedAt: new Date() } });

  return { checked: true, sent: 1 };
}

export default defineHandler({
  POST: method({
    auth: 'cron',
    async handle() {
      const [appCol, userCol, notifCol, jpCol] = await Promise.all([
        getCollection<ReminderApplicationDoc>('applications'),
        getCollection<ReminderUserDoc>('user'),
        getCollection<ReminderNotificationDoc>('notification_settings'),
        getCollection<ReminderJobPostingDoc>('job_postings'),
      ]);

      const now = new Date();

      const dueFilter: Filter<ReminderApplicationDoc> = {
        'reminder.at': { $lte: now },
        $expr: { $lt: ['$reminder.sentCount', '$reminder.maxCount'] },
        $or: [
          { 'reminder.snoozedUntil': null },
          { 'reminder.snoozedUntil': { $lte: now } },
        ],
        status: { $in: REMINDER_ELIGIBLE_STATUSES },
      };

      const due = await appCol.find(dueFilter).toArray();

      let sent = 0;
      let failed = 0;
      let skipped = 0;
      const errors: string[] = [];
      let jinaAlert: { checked: boolean; sent: number; skipped?: string; error?: string };
      let firecrawlAlert: { checked: boolean; sent: number; skipped?: string; error?: string };

      for (const app of due) {
        try {
          const frequencyDays = normalizeFrequencyDays(app.reminder?.frequencyDays);
          const [user, jp, notifSettings] = await Promise.all([
            userCol.findOne({ _id: new ObjectId(String(app.userId)) }),
            jpCol.findOne({ _id: new ObjectId(String(app.jobPostingId)) }),
            notifCol.findOne({ userId: String(app.userId) }),
          ]);

          if (!user || !jp) {
            skipped++;
            errors.push(`${app._id.toString()}: missing ${!user ? 'user' : 'job posting'}`);
            continue;
          }

          const emailEnabled = notifSettings?.email !== false;
          const pushEnabled = notifSettings?.push === true;

          if (emailEnabled && user.email) {
            await sendReminderEmail({
              to: user.email as string,
              applicationId: app._id.toString(),
              userId: String(app.userId),
              jobTitle: String(jp.title ?? ''),
              company: String(jp.company ?? ''),
              frequencyDays,
            });
          }

          if (pushEnabled && notifSettings?.vapidSubscription) {
            await sendWebPush(notifSettings.vapidSubscription as PushSubscription, {
              title: `Relance — ${jp.company}`,
              body: `N'oublie pas de relancer pour "${jp.title}"`,
              url: process.env.PUBLIC_APP_URL ?? 'https://joblog.arthurjenck.com',
            });
          }

          const nextAt = new Date(now.getTime() + frequencyDays * 24 * 60 * 60 * 1000);

          await appCol.updateOne(
            { _id: app._id },
            {
              $inc: { 'reminder.sentCount': 1 },
              $set: { 'reminder.at': nextAt, updated_at: now },
            }
          );

          sent++;
        } catch (error) {
          failed++;
          errors.push(
            `${app._id.toString()}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      try {
        jinaAlert = await checkJinaUsageAlerts();
      } catch (error) {
        jinaAlert = {
          checked: false,
          sent: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      try {
        firecrawlAlert = await checkFirecrawlUsageAlerts();
      } catch (error) {
        firecrawlAlert = {
          checked: false,
          sent: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      return {
        json: {
          processed: due.length,
          sent,
          failed,
          skipped,
          jinaAlert,
          firecrawlAlert,
          errors: errors.slice(0, 10),
        },
      };
    },
  }),
});
