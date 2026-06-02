import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getCollection } from '../../lib/db.js';
import { sendReminderEmail } from '../../lib/email.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const [appCol, userCol, notifCol, jpCol] = await Promise.all([
    getCollection('applications'),
    getCollection('user'),
    getCollection('notification_settings'),
    getCollection('job_postings'),
  ]);

  const now = new Date();

  const due = await appCol.find({
    'reminder.at': { $lte: now },
    $expr: { $lt: ['$reminder.sentCount', '$reminder.maxCount'] },
    $or: [
      { 'reminder.snoozedUntil': null },
      { 'reminder.snoozedUntil': { $lte: now } },
    ],
    status: { $nin: ['rejected', 'ghosted', 'offer'] },
  }).toArray();

  let sent = 0;
  let failed = 0;

  for (const app of due) {
    try {
      const [user, jp, notifSettings] = await Promise.all([
        userCol.findOne({ _id: new ObjectId(String(app.userId)) }),
        jpCol.findOne({ _id: new ObjectId(String(app.jobPostingId)) }),
        notifCol.findOne({ userId: String(app.userId) }),
      ]);

      if (!user || !jp) continue;

      const emailEnabled = notifSettings?.email !== false;
      const pushEnabled = notifSettings?.push === true;

      if (emailEnabled && user.email) {
        await sendReminderEmail({
          to: user.email as string,
          applicationId: app._id.toString(),
          userId: String(app.userId),
          jobTitle: String(jp.title ?? ''),
          company: String(jp.company ?? ''),
        });
      }

      if (pushEnabled && notifSettings?.vapidSubscription) {
        await sendWebPush(notifSettings.vapidSubscription as PushSubscription, {
          title: `Relance — ${jp.company}`,
          body: `N'oublie pas de relancer pour "${jp.title}"`,
          url: process.env.PUBLIC_APP_URL ?? 'https://joblog.arthurjenck.com',
        });
      }

      const frequencyDays = (app.reminder?.frequencyDays as number) ?? 7;
      const nextAt = new Date(now.getTime() + frequencyDays * 24 * 60 * 60 * 1000);

      await appCol.updateOne(
        { _id: app._id },
        {
          $inc: { 'reminder.sentCount': 1 },
          $set: { 'reminder.at': nextAt, updated_at: now },
        }
      );

      sent++;
    } catch {
      failed++;
    }
  }

  return res.status(200).json({ processed: due.length, sent, failed });
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
    process.env.VAPID_EMAIL!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  await sendNotification(subscription, JSON.stringify(payload));
}
