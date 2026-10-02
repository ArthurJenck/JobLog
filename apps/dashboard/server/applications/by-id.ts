import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';
import { normalizeLocationForStorage } from '../../lib/addresses.js';
import { getReminderDefaultDays } from '../../lib/notification-settings.js';
import {
  APPLICATION_STATUSES,
  CONTRACT_TYPES,
  REMOTE_TYPES,
  EVENT_TYPES,
  STATUS_EVENT,
  EVENT_AUTO_STATUS,
  TERMINAL_STATUSES,
  REMINDER_ELIGIBLE_STATUSES,
  resolveStatusOnEvent,
  deriveStatusFromEvents,
  type ApplicationStatus,
  type EventType,
} from '@joblog/shared';
import { resolveApplicationId } from './aliases.js';
import { loadApplicationWithJob } from './with-job.js';
import { resolveJobPostingIdentity } from '../job-postings/url-identity.js';

const ReminderPatchSchema = z.object({
  enabled: z.boolean().optional(),
  at: z.string().datetime().nullable().optional(),
  frequencyDays: z.number().int().positive().optional(),
  maxCount: z.number().int().positive().optional(),
  snoozedUntil: z.string().datetime().nullable().optional(),
}).strict();

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
  reminder: ReminderPatchSchema.optional(),
}).strict();

const AddEventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  at: z.string().datetime(),
  meta: z.record(z.unknown()).nullable().optional(),
}).strict();

const DeleteEventSchema = z.object({
  type: z.enum(EVENT_TYPES).refine((type) => type !== 'created', 'Cannot delete created event'),
  at: z.string().datetime(),
}).strict();

const UpdateEventDateSchema = z.object({
  type: z.enum(EVENT_TYPES),
  at: z.string().datetime(),
  newAt: z.string().datetime(),
}).strict();

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
  z.object({ event: AddEventSchema }).strict(),
  z.object({ jobPosting: PatchJobPostingSchema }).strict(),
  z.object({ deleteEvent: DeleteEventSchema }).strict(),
  z.object({ updateEventDate: UpdateEventDateSchema }).strict(),
  PatchApplicationSchema,
]);

interface StoredEvent {
  type: EventType;
  at: Date;
  meta: unknown;
}

interface ApplicationDoc {
  userId: string;
  jobPostingId: string;
  status: ApplicationStatus;
  appliedAt?: Date | null;
  events?: StoredEvent[];
  reminder?: {
    enabled?: boolean;
    at?: Date | null;
    frequencyDays?: number;
    maxCount?: number;
    sentCount?: number;
    snoozedUntil?: Date | null;
  } | null;
}

function dateOrNull(value: string | null) {
  return value === null ? null : new Date(value);
}

function assertAllowedEventDate(value: string) {
  const date = new Date(value);
  if (date.getTime() > Date.now() + 2 * 365 * 24 * 60 * 60_000) {
    throw ApiError.badRequest('La date est trop éloignée dans le futur', 'future_event_date');
  }
  return date;
}

async function resolveTarget(userId: string, requestedId: string) {
  const id = await resolveApplicationId(userId, requestedId);
  if (!id) throw ApiError.notFound('Candidature introuvable');
  return id;
}

async function reminderSchedule(app: ApplicationDoc, userId: string, from = Date.now()) {
  const frequencyDays = app.reminder?.frequencyDays ?? await getReminderDefaultDays(userId);
  return {
    'reminder.at': new Date(from + frequencyDays * 24 * 60 * 60_000),
    'reminder.frequencyDays': frequencyDays,
  };
}

export default defineHandler({
  GET: method({
    async handle({ user, query }) {
      const { id } = query as { id: string };
      return { json: await loadApplicationWithJob(user.id, await resolveTarget(user.id, id)) };
    },
  }),
  PATCH: method({
    maintenanceSensitive: true,
    body: PatchEnvelopeSchema,
    async handle({ user, query, body }) {
      const requestedId = (query as { id: string }).id;
      const applicationId = await resolveTarget(user.id, requestedId);
      const applications = await getCollection<ApplicationDoc>('applications');
      const appFilter = { _id: applicationId, userId: user.id };

      if ('event' in body) {
        const app = await applications.findOne(appFilter);
        if (!app) throw ApiError.notFound();

        const eventAt = assertAllowedEventDate(body.event.at);
        const event = { type: body.event.type, at: eventAt, meta: body.event.meta ?? null };
        const updates: Record<string, unknown> = { updated_at: new Date() };
        const automaticStatus = resolveStatusOnEvent(app.status, body.event.type);
        if (automaticStatus) {
          updates.status = automaticStatus;
          if (
            REMINDER_ELIGIBLE_STATUSES.includes(automaticStatus) &&
            app.reminder?.enabled !== false &&
            !app.reminder?.at
          ) {
            Object.assign(updates, await reminderSchedule(app, user.id, eventAt.getTime()));
          }
        }
        if (body.event.type === 'followup_sent' || body.event.type === 'response_received') {
          updates['reminder.at'] = null;
          updates['reminder.snoozedUntil'] = null;
        }

        const result = await applications.updateOne(appFilter, {
          $push: { events: event },
          $set: updates,
        });
        if (result.matchedCount === 0) throw ApiError.notFound();
        return { json: await loadApplicationWithJob(user.id, applicationId) };
      }

      if ('jobPosting' in body) {
        const app = await applications.findOne(appFilter);
        if (!app || !ObjectId.isValid(app.jobPostingId)) throw ApiError.notFound();

        const now = new Date();
        const jobPostingInput = body.jobPosting;
        const jobPostings = await getCollection('job_postings');
        const jobPostingId = new ObjectId(app.jobPostingId);
        const currentJob = await jobPostings.findOne({ _id: jobPostingId, userId: user.id });
        if (!currentJob) throw ApiError.notFound('Offre introuvable');
        const manualFields = new Set(
          Array.isArray(currentJob.manual_fields)
            ? currentJob.manual_fields.filter((field): field is string => typeof field === 'string')
            : [],
        );
        for (const field of Object.keys(jobPostingInput)) manualFields.add(field);
        const updates: Record<string, unknown> = {
          ...jobPostingInput,
          scrape_status: 'succeeded',
          scrape_steps: [],
          scrape_error: null,
          scrape_error_code: null,
          scrape_error_category: null,
          scrape_message_id: null,
          scrape_started_at: null,
          scrape_finished_at: now,
          manually_repaired_at: now,
          manual_fields: [...manualFields],
          updated_at: now,
        };
        if (Object.prototype.hasOwnProperty.call(jobPostingInput, 'location')) {
          Object.assign(updates, await normalizeLocationForStorage(jobPostingInput.location ?? null));
        }

        let previousDedupKey: string | null = null;
        if (jobPostingInput.url) {
          const isCustom = currentJob.source === 'custom';
          const identity = resolveJobPostingIdentity({
            url: jobPostingInput.url,
            source: isCustom ? 'custom' : undefined,
            sourceKey: isCustom && typeof currentJob.source_key === 'string' ? currentJob.source_key : null,
            title: jobPostingInput.title ?? (typeof currentJob.title === 'string' ? currentJob.title : null),
            company: jobPostingInput.company ?? (typeof currentJob.company === 'string' ? currentJob.company : null),
            location: jobPostingInput.location ?? (typeof currentJob.location === 'string' ? currentJob.location : null),
          });
          const conflict = await jobPostings.findOne({
            userId: user.id,
            dedup_key: identity.dedupKey,
            _id: { $ne: jobPostingId },
          }, { projection: { _id: 1 } });
          if (conflict) throw ApiError.conflict('Cette URL correspond déjà à une autre offre', 'dedup_conflict');

          previousDedupKey = typeof currentJob.dedup_key === 'string' && currentJob.dedup_key !== identity.dedupKey
            ? currentJob.dedup_key
            : null;
          updates.url = identity.canonicalUrl;
          updates.dedup_key = identity.dedupKey;
          updates.dedup_version = 2;
          updates.source = identity.source;
          updates.source_key = identity.sourceKey;
          updates.native_job_id = identity.nativeJobId;
        }

        if (previousDedupKey) {
          try {
            await (await getCollection('job_posting_aliases')).updateOne(
              { userId: user.id, legacyKey: previousDedupKey },
              {
                $setOnInsert: {
                  userId: user.id,
                  legacyKey: previousDedupKey,
                  targetJobPostingId: jobPostingId.toString(),
                  createdAt: now,
                },
              },
              { upsert: true },
            );
          } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
          }
        }

        let result;
        try {
          result = await jobPostings.updateOne(
            { _id: jobPostingId, userId: user.id },
            { $set: updates, $inc: { scrape_attempts: 1 } },
          );
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw ApiError.conflict('Cette URL correspond déjà à une autre offre', 'dedup_conflict');
          }
          throw error;
        }
        if (result.matchedCount === 0) throw ApiError.notFound('Offre introuvable');

        await applications.updateOne(appFilter, { $set: { updated_at: now } });
        return { json: await loadApplicationWithJob(user.id, applicationId) };
      }

      if ('deleteEvent' in body) {
        const app = await applications.findOne(appFilter);
        if (!app) throw ApiError.notFound();
        const targetAt = new Date(body.deleteEvent.at);
        const remaining = (app.events ?? []).filter(
          (event) => !(event.type === body.deleteEvent.type && event.at.getTime() === targetAt.getTime()),
        );
        if (remaining.length === (app.events ?? []).length) throw ApiError.notFound('Événement introuvable');

        const result = await applications.updateOne(appFilter, {
          $pull: { events: { type: body.deleteEvent.type, at: targetAt } },
          $set: {
            status: EVENT_AUTO_STATUS[body.deleteEvent.type]
              ? deriveStatusFromEvents(remaining)
              : app.status,
            updated_at: new Date(),
          },
        });
        if (result.modifiedCount === 0) throw ApiError.notFound('Événement introuvable');
        return { json: await loadApplicationWithJob(user.id, applicationId) };
      }

      if ('updateEventDate' in body) {
        const newAt = assertAllowedEventDate(body.updateEventDate.newAt);
        const targetAt = new Date(body.updateEventDate.at);
        const app = await applications.findOne({
          ...appFilter,
          events: { $elemMatch: { type: body.updateEventDate.type, at: targetAt } },
        });
        if (!app) throw ApiError.notFound('Événement introuvable');
        const events = (app.events ?? []).map((event) =>
          event.type === body.updateEventDate.type && event.at.getTime() === targetAt.getTime()
            ? { ...event, at: newAt }
            : event,
        );
        const updates: Record<string, unknown> = {
          'events.$[event].at': newAt,
          updated_at: new Date(),
        };
        if (EVENT_AUTO_STATUS[body.updateEventDate.type] !== undefined) {
          updates.status = deriveStatusFromEvents(events);
        }
        const result = await applications.updateOne(
          appFilter,
          { $set: updates },
          {
            arrayFilters: [{
              'event.type': body.updateEventDate.type,
              'event.at': targetAt,
            }],
          },
        );
        if (result.matchedCount === 0) throw ApiError.notFound();
        return { json: await loadApplicationWithJob(user.id, applicationId) };
      }

      const app = await applications.findOne(appFilter);
      if (!app) throw ApiError.notFound();
      const updates: Record<string, unknown> = { updated_at: new Date() };
      let statusEvent: StoredEvent | null = null;
      const { reminder, status, ...fields } = body;

      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) updates[key] = key === 'appliedAt' ? dateOrNull(value as string | null) : value;
      }

      if (status !== undefined) {
        updates.status = status;
        if (status === 'applied' && body.appliedAt === undefined && !app.appliedAt) {
          updates.appliedAt = new Date();
        }
        if (TERMINAL_STATUSES.includes(status)) {
          updates['reminder.at'] = null;
          updates['reminder.snoozedUntil'] = null;
        } else if (
          REMINDER_ELIGIBLE_STATUSES.includes(status) &&
          app.reminder?.enabled !== false &&
          !app.reminder?.at
        ) {
          Object.assign(updates, await reminderSchedule(app, user.id));
        }
        if (status !== app.status) {
          const eventType = STATUS_EVENT[status];
          if (eventType && !(app.events ?? []).some((event) => event.type === eventType)) {
            statusEvent = { type: eventType, at: new Date(), meta: null };
          }
        }
      }

      if (reminder) {
        const frequencyDays = reminder.frequencyDays ?? app.reminder?.frequencyDays ?? await getReminderDefaultDays(user.id);
        if (reminder.enabled === false) {
          updates['reminder.enabled'] = false;
          updates['reminder.at'] = null;
          updates['reminder.snoozedUntil'] = null;
        } else if (reminder.enabled === true) {
          updates['reminder.enabled'] = true;
          updates['reminder.frequencyDays'] = frequencyDays;
          updates['reminder.at'] = REMINDER_ELIGIBLE_STATUSES.includes(status ?? app.status)
            ? new Date(Date.now() + frequencyDays * 24 * 60 * 60_000)
            : null;
          updates['reminder.snoozedUntil'] = null;
        }

        for (const [key, value] of Object.entries(reminder)) {
          if (value === undefined || key === 'enabled') continue;
          updates[`reminder.${key}`] = key === 'at' || key === 'snoozedUntil'
            ? dateOrNull(value as string | null)
            : value;
        }
        if (reminder.at !== undefined && reminder.at !== null) updates['reminder.enabled'] = true;
      }

      const result = statusEvent
        ? await applications.updateOne(appFilter, { $set: updates, $push: { events: statusEvent } })
        : await applications.updateOne(appFilter, { $set: updates });
      if (result.matchedCount === 0) throw ApiError.notFound();
      return { json: await loadApplicationWithJob(user.id, applicationId) };
    },
  }),
  DELETE: method({
    maintenanceSensitive: true,
    async handle({ user, query }) {
      const requestedId = (query as { id: string }).id;
      const applicationId = await resolveTarget(user.id, requestedId);
      const result = await (await getCollection('applications')).deleteOne({
        _id: applicationId,
        userId: user.id,
      });
      if (result.deletedCount === 0) throw ApiError.notFound();
      return { json: { ok: true } };
    },
  }),
});

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}
