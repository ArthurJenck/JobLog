import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { isStreakContinuation } from '@joblog/shared';
import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';

interface UserStreakFields {
  streakCurrent?: number;
  streakLongest?: number;
  streakLastActiveDay?: string | null;
  streakLastPerfectDay?: string | null;
  streakPrevPerfectDay?: string | null;
  streakPerfectCurrent?: number;
}

const DaySchema = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const PerfectSchema = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  perfect: z.boolean().optional().default(true),
});

function perfectCurrentOf(fields: UserStreakFields): number {
  if (typeof fields.streakPerfectCurrent === 'number') return fields.streakPerfectCurrent;
  const last = fields.streakLastPerfectDay ?? null;
  if (!last) return 0;
  return isStreakContinuation(fields.streakPrevPerfectDay, last) ? 2 : 1;
}

function toResponse(fields: UserStreakFields) {
  return {
    current: fields.streakCurrent ?? 0,
    longest: fields.streakLongest ?? 0,
    lastActiveDay: fields.streakLastActiveDay ?? null,
    lastPerfectDay: fields.streakLastPerfectDay ?? null,
    prevPerfectDay: fields.streakPrevPerfectDay ?? null,
    perfectCurrent: perfectCurrentOf(fields),
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
        current = isStreakContinuation(lastActiveDay, today) ? current + 1 : 1;
      }
      const longest = Math.max(streakUser?.streakLongest ?? 0, current);

      const lastPerfectDay = streakUser?.streakLastPerfectDay ?? null;
      const perfectBroken =
        lastPerfectDay !== today && !isStreakContinuation(lastPerfectDay, today);
      const perfectCurrent = perfectBroken ? 0 : perfectCurrentOf(streakUser ?? {});

      await col.updateOne(
        userFilter,
        {
          $set: {
            streakCurrent: current,
            streakLongest: longest,
            streakLastActiveDay: today,
            streakPerfectCurrent: perfectCurrent,
          },
        },
      );

      return {
        json: toResponse({
          streakCurrent: current,
          streakLongest: longest,
          streakLastActiveDay: today,
          streakLastPerfectDay: lastPerfectDay,
          streakPrevPerfectDay: streakUser?.streakPrevPerfectDay ?? null,
          streakPerfectCurrent: perfectCurrent,
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
          const update: UserStreakFields = {
            streakLastPerfectDay: today,
            streakPerfectCurrent:
              isStreakContinuation(currentPerfect, today)
                ? perfectCurrentOf(streakUser ?? {}) + 1
                : 1,
          };
          if (currentPerfect) update.streakPrevPerfectDay = currentPerfect;
          await col.updateOne(userFilter, { $set: update });
        }
      } else if (currentPerfect === today) {
        await col.updateOne(userFilter, {
          $set: {
            streakLastPerfectDay: prevPerfect,
            streakPerfectCurrent:
              isStreakContinuation(prevPerfect, today)
                ? Math.max(0, perfectCurrentOf(streakUser ?? {}) - 1)
                : 0,
          },
        });
      }

      const updated = await col.findOne(userFilter);
      return { json: toResponse(updated ?? {}) };
    },
  }),
});
