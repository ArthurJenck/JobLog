import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  const userId = session.user.id;
  const col = await getCollection<UserStreakFields>('user');
  const userFilter = { _id: new ObjectId(userId) };

  if (req.method === 'GET') {
    const user = await col.findOne(userFilter);
    return res.status(200).json(toResponse(user ?? {}));
  }

  if (req.method === 'POST') {
    const parsed = DaySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { today } = parsed.data;

    const user = await col.findOne(userFilter);
    const lastActiveDay = user?.streakLastActiveDay ?? null;
    let current = user?.streakCurrent ?? 0;

    if (lastActiveDay !== today) {
      current = lastActiveDay === shiftDayKey(today, -1) ? current + 1 : 1;
    }
    const longest = Math.max(user?.streakLongest ?? 0, current);

    await col.updateOne(
      userFilter,
      { $set: { streakCurrent: current, streakLongest: longest, streakLastActiveDay: today } },
    );

    return res.status(200).json(
      toResponse({
        streakCurrent: current,
        streakLongest: longest,
        streakLastActiveDay: today,
        streakLastPerfectDay: user?.streakLastPerfectDay ?? null,
        streakPrevPerfectDay: user?.streakPrevPerfectDay ?? null,
      }),
    );
  }

  if (req.method === 'PATCH') {
    const parsed = PerfectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { today, perfect } = parsed.data;

    const user = await col.findOne(userFilter);
    const currentPerfect = user?.streakLastPerfectDay ?? null;
    const prevPerfect = user?.streakPrevPerfectDay ?? null;

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
    return res.status(200).json(toResponse(updated ?? {}));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
