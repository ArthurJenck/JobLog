import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId, type Filter } from 'mongodb';
import { getCollection } from '../../lib/db.js';
import { getEnv } from '../../lib/env.js';
import { sendReminderEmail } from '../../lib/email.js';
import { sendEmail } from '../../lib/resend.js';
import { REMINDER_ELIGIBLE_STATUSES } from '@joblog/shared';

const JINA_ALERT_THRESHOLD_DEFAULT = 8_000_000;
const FIRECRAWL_MONTHLY_SOFT_CAP = 900;
const PARIS_TIME_ZONE = 'Europe/Paris';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const [appCol, userCol, notifCol, jpCol] = await Promise.all([
    getCollection<ReminderApplicationDoc>('applications'),
    getCollection<ReminderUserDoc>('user'),
    getCollection<ReminderNotificationDoc>('notification_settings'),
    getCollection<ReminderJobPostingDoc>('job_postings'),
  ]);

  const now = new Date();

  const dueFilter = {
    'reminder.at': { $lte: now },
    $expr: { $lt: ['$reminder.sentCount', '$reminder.maxCount'] },
    $or: [
      { 'reminder.snoozedUntil': null },
      { 'reminder.snoozedUntil': { $lte: now } },
    ],
    status: { $in: REMINDER_ELIGIBLE_STATUSES },
  } as Filter<ReminderApplicationDoc>;

  const due = await appCol.find(dueFilter).toArray();

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];
  let jinaAlert: { checked: boolean; sent: number; skipped?: string; error?: string };
  let firecrawlAlert: { checked: boolean; sent: number; skipped?: string; error?: string };

  for (const app of due) {
    try {
      const frequencyDays = normalizeFrequencyDays(app.reminder?.frequencyDays as number | undefined);
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

  return res.status(200).json({
    processed: due.length,
    sent,
    failed,
    skipped,
    jinaAlert,
    firecrawlAlert,
    errors: errors.slice(0, 10),
  });
}

function normalizeFrequencyDays(value: number | undefined) {
  const n = typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 7;
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

function getParisMonthKey(date = new Date()) {
  return getParisDateKey(date).slice(0, 7);
}

function getJinaAlertThreshold() {
  const raw = getEnv('JINA_ESTIMATED_TOKEN_ALERT_THRESHOLD');
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? Math.trunc(parsed)
    : JINA_ALERT_THRESHOLD_DEFAULT;
}

function getParisDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: PARIS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char];
  });
}
