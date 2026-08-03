import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';

const SubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      auth: z.string(),
      p256dh: z.string(),
    }),
  }).nullable().optional(),
  email: z.boolean().optional(),
  reminderDefaultDays: z.number().int().positive().max(60).optional(),
});

export default defineHandler({
  GET: method({
    async handle({ user }) {
      const col = await getCollection('notification_settings');
      const settings = await col.findOne({ userId: user.id });
      return {
        json: {
          email: settings?.email ?? true,
          push: settings?.push ?? false,
          reminderDefaultDays: settings?.reminderDefaultDays ?? 7,
          hasSubscription: !!settings?.vapidSubscription,
        },
      };
    },
  }),
  POST: method({
    body: SubscribeSchema,
    async handle({ user, body }) {
      const { subscription, email, reminderDefaultDays } = body;
      const update: Record<string, unknown> = {};

      if (subscription !== undefined) {
        update['vapidSubscription'] = subscription;
        update['push'] = subscription !== null;
      }
      if (email !== undefined) update['email'] = email;
      if (reminderDefaultDays !== undefined) update['reminderDefaultDays'] = reminderDefaultDays;

      const col = await getCollection('notification_settings');
      await col.updateOne(
        { userId: user.id },
        { $set: { ...update, userId: user.id } },
        { upsert: true }
      );

      return { json: { ok: true } };
    },
  }),
});
