import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';

interface UserStreakFields {
  streakCurrent?: number;
  streakLongest?: number;
  streakLastActiveDay?: string | null;
  streakLastPerfectDay?: string | null;
  streakPrevPerfectDay?: string | null;
}

const DaySchema = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const PerfectSchema = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  perfect: z.boolean().optional().default(true),
});

function shiftDayKey(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function toResponse(fields: UserStreakFields) {
  return {
    current: fields.streakCurrent ?? 0,
    longest: fields.streakLongest ?? 0,
    lastActiveDay: fields.streakLastActiveDay ?? null,
    lastPerfectDay: fields.streakLastPerfectDay ?? null,
    prevPerfectDay: fields.streakPrevPerfectDay ?? null,
  };
}

export default defineHandler({
  GET: method({
    async handle({ user }) {
      const col = await getCollection<UserStreakFields>('user');
      const streakUser = await col.findOne({ _id: new ObjectId(user.id) });
      return { json: toResponse(streakUser ?? {}) };
    },
  }),
  POST: method({
    body: DaySchema,
    async handle({ user, body }) {
      const { today } = body;
      const col = await getCollection<UserStreakFields>('user');
      const userFilter = { _id: new ObjectId(user.id) };

      const streakUser = await col.findOne(userFilter);
      const lastActiveDay = streakUser?.streakLastActiveDay ?? null;
      let current = streakUser?.streakCurrent ?? 0;

      if (lastActiveDay !== today) {
        current = lastActiveDay === shiftDayKey(today, -1) ? current + 1 : 1;
      }
      const longest = Math.max(streakUser?.streakLongest ?? 0, current);

      await col.updateOne(
        userFilter,
        { $set: { streakCurrent: current, streakLongest: longest, streakLastActiveDay: today } },
      );

      return {
        json: toResponse({
          streakCurrent: current,
          streakLongest: longest,
          streakLastActiveDay: today,
          streakLastPerfectDay: streakUser?.streakLastPerfectDay ?? null,
          streakPrevPerfectDay: streakUser?.streakPrevPerfectDay ?? null,
        }),
      };
    },
  }),
  PATCH: method({
    body: PerfectSchema,
    async handle({ user, body }) {
      const { today, perfect } = body;
      const col = await getCollection<UserStreakFields>('user');
      const userFilter = { _id: new ObjectId(user.id) };

      const streakUser = await col.findOne(userFilter);
      const currentPerfect = streakUser?.streakLastPerfectDay ?? null;
      const prevPerfect = streakUser?.streakPrevPerfectDay ?? null;

      if (perfect) {
        if (currentPerfect !== today) {
          const update: UserStreakFields = { streakLastPerfectDay: today };
          if (currentPerfect) update.streakPrevPerfectDay = currentPerfect;
          await col.updateOne(userFilter, { $set: update });
        }
      } else if (currentPerfect === today) {
        await col.updateOne(userFilter, { $set: { streakLastPerfectDay: prevPerfect } });
      }

      const updated = await col.findOne(userFilter);
      return { json: toResponse(updated ?? {}) };
    },
  }),
});
