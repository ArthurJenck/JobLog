import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';
import { normalizeLocationForStorage } from '../../lib/addresses.js';
import { APPLICATION_STATUSES, CONTRACT_TYPES, REMOTE_TYPES, EVENT_TYPES, STATUS_EVENT, EVENT_AUTO_STATUS, TERMINAL_STATUSES, resolveStatusOnEvent, deriveStatusFromEvents, type ApplicationStatus, type EventType } from '@joblog/shared';

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

const DeleteEventSchema = z.object({
  type: z.enum(EVENT_TYPES).refine(t => t !== 'created', 'Cannot delete created event'),
  at: z.string().datetime(),
});

const UpdateEventDateSchema = z.object({
  type: z.enum(EVENT_TYPES),
  at: z.string().datetime(),
  newAt: z.string().datetime(),
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
  url: z.string().url().optional(),
}).strict();

function toDateOrNull(value: string | null) {
  return value === null ? null : new Date(value);
}

interface ApplicationDoc {
  userId: string;
  jobPostingId: string;
  status: ApplicationStatus;
  events?: Array<{ type: EventType; at: Date; meta: unknown }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  const { id } = req.query as { id: string };
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  const col = await getCollection<ApplicationDoc>('applications');
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
      const setOps: Record<string, unknown> = { updated_at: new Date() };

      if (EVENT_AUTO_STATUS[parsed.data.type] !== undefined) {
        const app = await col.findOne(appFilter);
        if (!app) return res.status(404).json({ error: 'Not found' });
        const newStatus = resolveStatusOnEvent(app.status, parsed.data.type);
        if (newStatus) setOps['status'] = newStatus;
      }

      await col.updateOne(appFilter, {
        $push: { events: event },
        $set: setOps,
      });
      return res.status(200).json({ ok: true });
    }

    if (body.jobPosting) {
      const parsed = PatchJobPostingSchema.safeParse(body.jobPosting);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const app = await col.findOne(appFilter);
      if (!app) return res.status(404).json({ error: 'Not found' });

      const jpCol = await getCollection('job_postings');
      const updates: Record<string, unknown> = { ...parsed.data, updated_at: new Date() };
      if (Object.prototype.hasOwnProperty.call(parsed.data, 'location')) {
        Object.assign(updates, await normalizeLocationForStorage(parsed.data.location));
      }

      await jpCol.updateOne(
        { _id: new ObjectId(String(app.jobPostingId)) },
        { $set: updates }
      );
      return res.status(200).json({ ok: true });
    }

    if (body.deleteEvent) {
      const parsed = DeleteEventSchema.safeParse(body.deleteEvent);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const setOps: Record<string, unknown> = { updated_at: new Date() };

      if (EVENT_AUTO_STATUS[parsed.data.type] !== undefined) {
        const app = await col.findOne(appFilter);
        if (!app) return res.status(404).json({ error: 'Not found' });
        const remaining = (app.events ?? []).filter(
          (e: { type: string; at: Date }) =>
            !(e.type === parsed.data.type && e.at.toISOString() === new Date(parsed.data.at).toISOString()),
        );
        setOps['status'] = deriveStatusFromEvents(remaining as Array<{ type: EventType; at: Date }>);
      }

      await col.updateOne(appFilter, {
        $pull: { events: { type: parsed.data.type, at: new Date(parsed.data.at) } },
        $set: setOps,
      });
      return res.status(200).json({ ok: true });
    }

    if (body.updateEventDate) {
      const parsed = UpdateEventDateSchema.safeParse(body.updateEventDate);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      await col.updateOne(
        appFilter,
        { $set: { 'events.$[elem].at': new Date(parsed.data.newAt), updated_at: new Date() } },
        { arrayFilters: [{ 'elem.type': parsed.data.type, 'elem.at': new Date(parsed.data.at) }] }
      );
      return res.status(200).json({ ok: true });
    }

    const parsed = PatchApplicationSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const updates: Record<string, unknown> = { updated_at: new Date() };
    const { reminder, status, ...restFields } = parsed.data;

    for (const [k, v] of Object.entries(restFields)) {
      if (v !== undefined) updates[k] = k === 'appliedAt' ? toDateOrNull(v as string | null) : v;
    }

    if (status !== undefined) {
      updates['status'] = status;
      if (status === 'applied' && !parsed.data.appliedAt) {
        updates['appliedAt'] = new Date();
      }
      if (TERMINAL_STATUSES.includes(status)) {
        updates['reminder.at'] = null;
      }
      const app = await col.findOne(appFilter);
      if (!app) return res.status(404).json({ error: 'Not found' });
      if (status !== app.status) {
        const newType = STATUS_EVENT[status];
        if (newType) {
          const events = (app.events ?? []) as Array<{ type: string; at: Date; meta: unknown }>;
          if (!events.some(e => e.type === newType)) {
            updates['events'] = [...events, { type: newType, at: new Date(), meta: null }];
          }
        }
      }
    }

    if (reminder) {
      for (const [k, v] of Object.entries(reminder)) {
        if (v !== undefined) {
          updates[`reminder.${k}`] =
            k === 'at' || k === 'snoozedUntil' ? toDateOrNull(v as string | null) : v;
        }
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
