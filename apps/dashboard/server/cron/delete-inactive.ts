import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getCollection } from '../../lib/db.js';
import { sendEmail } from '../../lib/resend.js';
import { getEnv } from '../../lib/env.js';

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function activityFilter(cutoff: Date) {
  return {
    $or: [
      { lastActiveAt: { $lt: cutoff } },
      { lastActiveAt: { $exists: false }, createdAt: { $lt: cutoff } },
    ],
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date();
  const warnCutoff = new Date(now.getTime() - 5 * MONTH_MS);
  const deleteCutoff = new Date(now.getTime() - 6 * MONTH_MS);
  const appUrl = getEnv('PUBLIC_APP_URL') ?? 'https://joblog.arthurjenck.com';

  const userCol = await getCollection('user');

  const toWarn = await userCol
    .find({ ...activityFilter(warnCutoff), inactivityWarnedAt: { $exists: false } })
    .toArray();

  const toDelete = await userCol
    .find({ ...activityFilter(deleteCutoff), inactivityWarnedAt: { $exists: true } })
    .toArray();

  let warned = 0;
  let deleted = 0;
  const errors: string[] = [];

  for (const user of toWarn) {
    try {
      await sendEmail({
        from: getEnv('RESEND_FROM') ?? 'JobLog <noreply@arthurjenck.com>',
        to: String(user.email),
        subject: 'Votre compte JobLog sera supprimé dans 30 jours',
        html: `<p>Bonjour,</p>
<p>Votre compte JobLog est inactif depuis plus de 5 mois. Si vous ne vous reconnectez pas dans les 30 prochains jours, votre compte et toutes vos données (candidatures, CV, rappels) seront supprimés automatiquement.</p>
<p><a href="${appUrl}">Accéder à JobLog pour conserver mon compte</a></p>
<p>Si vous ne souhaitez pas conserver votre compte, aucune action n'est nécessaire.</p>`,
      });
      await userCol.updateOne({ _id: user._id }, { $set: { inactivityWarnedAt: now } });
      warned++;
    } catch (err) {
      errors.push(`warn ${String(user._id)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const user of toDelete) {
    const userId = String(user._id);
    try {
      const [appCol, cvsCol, notifCol, extCol, sessionCol, accountCol] = await Promise.all([
        getCollection('applications'),
        getCollection('cvs'),
        getCollection('notification_settings'),
        getCollection('extension_tokens'),
        getCollection('session'),
        getCollection('account'),
      ]);

      await Promise.all([
        appCol.deleteMany({ userId }),
        cvsCol.deleteMany({ userId }),
        notifCol.deleteMany({ userId }),
        extCol.deleteMany({ userId }),
        sessionCol.deleteMany({ userId }),
        accountCol.deleteMany({ userId }),
      ]);

      await userCol.deleteOne({ _id: new ObjectId(userId) });
      deleted++;
    } catch (err) {
      errors.push(`delete ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return res.status(200).json({ warned, deleted, errors: errors.slice(0, 20) });
}
