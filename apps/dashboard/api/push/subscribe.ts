import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';

const SubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      auth: z.string(),
      p256dh: z.string(),
    }),
  }).nullable(),
  email: z.boolean().optional(),
  reminderDefaultDays: z.number().int().positive().optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  const col = await getCollection('notification_settings');

  if (req.method === 'GET') {
    const settings = await col.findOne({ userId: session.user.id });
    return res.status(200).json({
      email: settings?.email ?? true,
      push: settings?.push ?? false,
      reminderDefaultDays: settings?.reminderDefaultDays ?? 7,
      hasSubscription: !!settings?.vapidSubscription,
    });
  }

  if (req.method === 'POST') {
    const parsed = SubscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { subscription, email, reminderDefaultDays } = parsed.data;
    const update: Record<string, unknown> = {};

    if (subscription !== undefined) {
      update['vapidSubscription'] = subscription;
      update['push'] = subscription !== null;
    }
    if (email !== undefined) update['email'] = email;
    if (reminderDefaultDays !== undefined) update['reminderDefaultDays'] = reminderDefaultDays;

    await col.updateOne(
      { userId: session.user.id },
      { $set: { ...update, userId: session.user.id } },
      { upsert: true }
    );

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
