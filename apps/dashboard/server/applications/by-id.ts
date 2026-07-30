import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';
import { normalizeLocationForStorage } from '../../lib/addresses.js';
import { APPLICATION_STATUSES, CONTRACT_TYPES, REMOTE_TYPES, EVENT_TYPES, STATUS_EVENT, EVENT_AUTO_STATUS, TERMINAL_STATUSES, REMINDER_ELIGIBLE_STATUSES, resolveStatusOnEvent, deriveStatusFromEvents, type ApplicationStatus, type EventType } from '@joblog/shared';

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

const PatchEnvelopeSchema = z.union([
  z.object({ event: AddEventSchema }),
  z.object({ jobPosting: PatchJobPostingSchema }),
  z.object({ deleteEvent: DeleteEventSchema }),
  z.object({ updateEventDate: UpdateEventDateSchema }),
  PatchApplicationSchema,
]);

function toDateOrNull(value: string | null) {
  return value === null ? null : new Date(value);
}

interface ApplicationDoc {
  userId: string;
  jobPostingId: string;
  status: ApplicationStatus;
  events?: Array<{ type: EventType; at: Date; meta: unknown }>;
  reminder?: { at?: Date | null; frequencyDays?: number } | null;
}

function computeReminderInitAt(app: ApplicationDoc) {
  const frequencyDays = app.reminder?.frequencyDays ?? 7;
  return new Date(Date.now() + frequencyDays * 24 * 60 * 60 * 1000);
}

export default defineHandler({
  GET: method({
    async handle({ user, query }) {
      const { id } = query as { id: string };
      if (!ObjectId.isValid(id)) throw ApiError.badRequest('Invalid id');

      const col = await getCollection<ApplicationDoc>('applications');
      const appFilter = { _id: new ObjectId(id), userId: user.id };

      const app = await col.findOne(appFilter);
      if (!app) throw ApiError.notFound();

      const jpCol = await getCollection('job_postings');
      const jp = await jpCol.findOne({ _id: new ObjectId(String(app.jobPostingId)), userId: user.id });

      return {
        json: {
          ...app,
          _id: app._id.toString(),
          jobPosting: jp
            ? {
                ...jp,
                _id: jp._id.toString(),
              }
            : null,
        },
      };
    },
  }),
  PATCH: method({
    body: PatchEnvelopeSchema,
    async handle({ user, query, body }) {
      const { id } = query as { id: string };
      if (!ObjectId.isValid(id)) throw ApiError.badRequest('Invalid id');

      const col = await getCollection<ApplicationDoc>('applications');
      const userId = user.id;
      const appFilter = { _id: new ObjectId(id), userId };

      if ('event' in body) {
        const eventInput = body.event;
        const event = { ...eventInput, at: eventInput.at ? new Date(eventInput.at) : new Date(), meta: eventInput.meta ?? null };
        const setOps: Record<string, unknown> = { updated_at: new Date() };

        if (EVENT_AUTO_STATUS[eventInput.type] !== undefined) {
          const app = await col.findOne(appFilter);
          if (!app) throw ApiError.notFound();
          const newStatus = resolveStatusOnEvent(app.status, eventInput.type);
          if (newStatus) {
            setOps['status'] = newStatus;
            if (REMINDER_ELIGIBLE_STATUSES.includes(newStatus) && !app.reminder?.at) {
              setOps['reminder.at'] = computeReminderInitAt(app);
            }
          }
        }

        await col.updateOne(appFilter, {
          $push: { events: event },
          $set: setOps,
        });
        return { json: { ok: true } };
      }

      if ('jobPosting' in body) {
        const jobPostingInput = body.jobPosting;

        const app = await col.findOne(appFilter);
        if (!app) throw ApiError.notFound();

        const jpCol = await getCollection('job_postings');
        const now = new Date();
        const updates: Record<string, unknown> = {
          ...jobPostingInput,
          scrape_status: 'succeeded',
          scrape_error: null,
          scrape_finished_at: now,
          updated_at: now,
        };
        if (Object.prototype.hasOwnProperty.call(jobPostingInput, 'location')) {
          Object.assign(updates, await normalizeLocationForStorage(jobPostingInput.location ?? null));
        }

        await jpCol.updateOne(
          { _id: new ObjectId(String(app.jobPostingId)), userId },
          { $set: updates }
        );
        return { json: { ok: true } };
      }

      if ('deleteEvent' in body) {
        const deleteEventInput = body.deleteEvent;
        const setOps: Record<string, unknown> = { updated_at: new Date() };

        if (EVENT_AUTO_STATUS[deleteEventInput.type] !== undefined) {
          const app = await col.findOne(appFilter);
          if (!app) throw ApiError.notFound();
          const remaining = (app.events ?? []).filter(
            (e: { type: string; at: Date }) =>
              !(e.type === deleteEventInput.type && e.at.toISOString() === new Date(deleteEventInput.at).toISOString()),
          );
          setOps['status'] = deriveStatusFromEvents(remaining as Array<{ type: EventType; at: Date }>);
        }

        await col.updateOne(appFilter, {
          $pull: { events: { type: deleteEventInput.type, at: new Date(deleteEventInput.at) } },
          $set: setOps,
        });
        return { json: { ok: true } };
      }

      if ('updateEventDate' in body) {
        const updateEventDateInput = body.updateEventDate;
        await col.updateOne(
          appFilter,
          { $set: { 'events.$[elem].at': new Date(updateEventDateInput.newAt), updated_at: new Date() } },
          { arrayFilters: [{ 'elem.type': updateEventDateInput.type, 'elem.at': new Date(updateEventDateInput.at) }] }
        );
        return { json: { ok: true } };
      }

      const updates: Record<string, unknown> = { updated_at: new Date() };
      const { reminder, status, ...restFields } = body;

      for (const [k, v] of Object.entries(restFields)) {
        if (v !== undefined) updates[k] = k === 'appliedAt' ? toDateOrNull(v as string | null) : v;
      }

      if (status !== undefined) {
        const app = await col.findOne(appFilter);
        if (!app) throw ApiError.notFound();

        updates['status'] = status;
        if (status === 'applied' && !body.appliedAt) {
          updates['appliedAt'] = new Date();
        }
        if (TERMINAL_STATUSES.includes(status)) {
          updates['reminder.at'] = null;
        } else if (REMINDER_ELIGIBLE_STATUSES.includes(status) && !app.reminder?.at) {
          updates['reminder.at'] = computeReminderInitAt(app);
        }
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
      if (result.matchedCount === 0) throw ApiError.notFound();

      return { json: { ok: true } };
    },
  }),
  DELETE: method({
    async handle({ user, query }) {
      const { id } = query as { id: string };
      if (!ObjectId.isValid(id)) throw ApiError.badRequest('Invalid id');

      const col = await getCollection<ApplicationDoc>('applications');
      const appFilter = { _id: new ObjectId(id), userId: user.id };

      const result = await col.deleteOne(appFilter);
      if (result.deletedCount === 0) throw ApiError.notFound();
      return { json: { ok: true } };
    },
  }),
});
