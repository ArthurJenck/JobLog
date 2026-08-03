import { getParisDateKey, getParisMonthKey, REMINDER_ELIGIBLE_STATUSES } from '@joblog/shared';
import { ObjectId, type AnyBulkWriteOperation, type Filter } from 'mongodb';
import { getCollection } from '../../lib/db.js';
import { getEnv } from '../../lib/env.js';
import { buildReminderDigestEmail } from '../../lib/email.js';
import { escapeHtml } from '../../lib/html.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { sendEmail, sendEmails } from '../../lib/resend.js';
import { FIRECRAWL_MONTHLY_SOFT_CAP, getJinaAlertThreshold } from '../usage/provider-usage.js';
import { buildPushPayload, groupDueReminders, type ReminderGroup } from './reminders-digest.js';

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

function toObjectIds(ids: Iterable<string>) {
  return [...new Set(ids)].filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
}

async function loadReminderContext(due: DueApplicationRow[]) {
  const [userCol, notifCol, jpCol] = await Promise.all([
    getCollection<ReminderUserDoc>('user'),
    getCollection<ReminderNotificationDoc>('notification_settings'),
    getCollection<ReminderJobPostingDoc>('job_postings'),
  ]);

  const userIds = due.map((app) => app.userId);

  const [userDocs, jpDocs, notifDocs] = await Promise.all([
    userCol.find({ _id: { $in: toObjectIds(userIds) } }).toArray(),
    jpCol.find({ _id: { $in: toObjectIds(due.map((app) => app.jobPostingId)) } }).toArray(),
    notifCol.find({ userId: { $in: [...new Set(userIds)] } }).toArray(),
  ]);

  return {
    users: new Map(userDocs.map((doc) => [doc._id.toString(), doc])),
    jobPostings: new Map(jpDocs.map((doc) => [doc._id.toString(), doc])),
    notificationSettings: new Map(notifDocs.map((doc) => [doc.userId, doc])),
  };
}

interface DueApplicationRow {
  applicationId: string;
  userId: string;
  jobPostingId: string;
  frequencyDays?: number;
}

async function notifyGroup(group: ReminderGroup) {
  if (!group.pushEnabled || !group.vapidSubscription) return;

  const url = getEnv('PUBLIC_APP_URL') ?? 'https://joblog.arthurjenck.com';
  await sendWebPush(group.vapidSubscription as PushSubscription, buildPushPayload(group, url));
}

export async function runReminders() {
  const appCol = await getCollection<ReminderApplicationDoc>('applications');

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

  const dueDocs = await appCol.find(dueFilter).toArray();
  const due: DueApplicationRow[] = dueDocs.map((doc) => ({
    applicationId: doc._id.toString(),
    userId: String(doc.userId),
    jobPostingId: String(doc.jobPostingId),
    frequencyDays: doc.reminder?.frequencyDays,
  }));

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  let groups: ReminderGroup[] = [];
  let skipped = 0;
  let jinaAlert: { checked: boolean; sent: number; skipped?: string; error?: string };
  let firecrawlAlert: { checked: boolean; sent: number; skipped?: string; error?: string };

  if (due.length > 0) {
    const context = await loadReminderContext(due);
    const grouped = groupDueReminders({ due, ...context });
    groups = grouped.groups;
    skipped = grouped.skipped.length;
    errors.push(...grouped.skipped);

    const mailable = groups.filter((group) => group.emailEnabled && group.email);
    const emailResults = await sendEmails(
      mailable.map((group) =>
        buildReminderDigestEmail({
          to: group.email as string,
          userId: group.userId,
          items: group.items,
        })
      )
    );

    const emailFailures = new Map<string, string>();
    emailResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        const reason = result.reason;
        emailFailures.set(
          mailable[index].userId,
          reason instanceof Error ? reason.message : String(reason)
        );
      }
    });

    const operations: AnyBulkWriteOperation<ReminderApplicationDoc>[] = [];

    for (const group of groups) {
      const emailError = emailFailures.get(group.userId);
      if (emailError) {
        failed += group.items.length;
        errors.push(`${group.userId}: ${emailError}`);
        continue;
      }

      try {
        await notifyGroup(group);
      } catch (error) {
        errors.push(
          `${group.userId}: push failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      for (const item of group.items) {
        operations.push({
          updateOne: {
            filter: { _id: new ObjectId(item.applicationId) } as Filter<ReminderApplicationDoc>,
            update: {
              $inc: { 'reminder.sentCount': 1 },
              $set: {
                'reminder.at': new Date(now.getTime() + item.frequencyDays * 24 * 60 * 60 * 1000),
                updated_at: now,
              },
            },
          },
        });
      }

      sent += group.items.length;
    }

    if (operations.length > 0) {
      await appCol.bulkWrite(operations);
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
    processed: due.length,
    users: groups.length,
    emails: groups.filter((group) => group.emailEnabled && group.email).length,
    sent,
    failed,
    skipped,
    jinaAlert,
    firecrawlAlert,
    errors: errors.slice(0, 10),
  };
}

const remindersMethod = method({
  auth: 'cron',
  async handle() {
    return { json: await runReminders() };
  },
});

export default defineHandler({
  GET: remindersMethod,
  POST: remindersMethod,
});
