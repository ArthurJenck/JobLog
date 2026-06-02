import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';
import { APPLICATION_STATUSES, CONTRACT_TYPES, REMOTE_TYPES, EVENT_TYPES } from '@joblog/shared';

const PatchApplicationSchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  cvId: z.string().nullable().optional(),
  appliedAt: z.string().datetime().nullable().optional(),
  contact: z.object({
    name: z.string().nullable(),
    role: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }).nullable().optional(),
  notes: z.string().nullable().optional(),
  reminder: z.object({
    at: z.string().datetime().nullable(),
    frequencyDays: z.number().int().positive(),
    maxCount: z.number().int().positive(),
    snoozedUntil: z.string().datetime().nullable(),
  }).partial().optional(),
}).strict();

const AddEventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  at: z.string().datetime().optional(),
  meta: z.record(z.unknown()).nullable().optional(),
});

const PatchJobPostingSchema = z.object({
  title: z.string().min(1).optional(),
  company: z.string().min(1).optional(),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  contract_type: z.enum(CONTRACT_TYPES).nullable().optional(),
  remote: z.enum(REMOTE_TYPES).nullable().optional(),
  salary: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    currency: z.string().nullable(),
    period: z.enum(['month', 'year']).nullable(),
  }).nullable().optional(),
  requirements: z.array(z.string()).nullable().optional(),
  keywords: z.array(z.string()).nullable().optional(),
  company_website: z.string().nullable().optional(),
}).strict();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  const { id } = req.query as { id: string };
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  const col = await getCollection('applications');
  const userId = session.user.id;
  const appFilter = { _id: new ObjectId(id), userId };

  if (req.method === 'GET') {
    const app = await col.findOne(appFilter);
    if (!app) return res.status(404).json({ error: 'Not found' });

    const jpCol = await getCollection('job_postings');
    const jp = await jpCol.findOne({ _id: new ObjectId(String(app.jobPostingId)) });

    return res.status(200).json({ ...app, _id: app._id.toString(), jobPosting: jp });
  }

  if (req.method === 'PATCH') {
    const body = req.body as Record<string, unknown>;

    if (body.event) {
      const parsed = AddEventSchema.safeParse(body.event);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const event = { ...parsed.data, at: parsed.data.at ? new Date(parsed.data.at) : new Date(), meta: parsed.data.meta ?? null };
      await col.updateOne(appFilter, {
        $push: { events: event },
        $set: { updated_at: new Date() },
      });
      return res.status(200).json({ ok: true });
    }

    if (body.jobPosting) {
      const parsed = PatchJobPostingSchema.safeParse(body.jobPosting);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const app = await col.findOne(appFilter);
      if (!app) return res.status(404).json({ error: 'Not found' });

      const jpCol = await getCollection('job_postings');
      await jpCol.updateOne(
        { _id: new ObjectId(String(app.jobPostingId)) },
        { $set: { ...parsed.data, updated_at: new Date() } }
      );
      return res.status(200).json({ ok: true });
    }

    const parsed = PatchApplicationSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const updates: Record<string, unknown> = { updated_at: new Date() };
    const { reminder, ...rest } = parsed.data;

    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) updates[k] = v;
    }

    if (parsed.data.status === 'applied' && !parsed.data.appliedAt) {
      updates['appliedAt'] = new Date();
    }

    if (reminder) {
      for (const [k, v] of Object.entries(reminder)) {
        if (v !== undefined) updates[`reminder.${k}`] = v;
      }
    }

    const result = await col.updateOne(appFilter, { $set: updates });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Not found' });

    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const result = await col.deleteOne(appFilter);
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
