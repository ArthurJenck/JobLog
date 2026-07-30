import {
  TASK_RECURRENCES,
  TASK_CATALOG,
  DEFAULT_TASK_KEYS,
  STATUS_CHANGE_EVENTS,
  type TaskRecurrence,
  type TaskDetectionSignal,
} from '@joblog/shared';
import { ObjectId, type WithId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';

interface TaskDoc {
  userId: string;
  key: string | null;
  title: string;
  recurrence: TaskRecurrence;
  target: number | null;
  detectionSignal: TaskDetectionSignal | null;
  enabled: boolean;
  removed: boolean;
  order: number;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ActivateCatalogTaskSchema = z.object({
  key: z.string().min(1),
});

const CreateCustomTaskSchema = z.object({
  title: z.string().min(1),
  recurrence: z.enum(TASK_RECURRENCES),
  target: z.number().int().positive().nullable().optional(),
});

const UpdateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  recurrence: z.enum(TASK_RECURRENCES).optional(),
  target: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
  removed: z.boolean().optional(),
  completed: z.boolean().optional(),
});

const ReorderTasksSchema = z.object({
  order: z.array(z.string()).min(1),
});

async function seedDefaultTasks(userId: string) {
  const col = await getCollection<TaskDoc>('quest_templates');
  const existing = await col.countDocuments({ userId });
  if (existing > 0) return;

  const now = new Date();
  const docs = DEFAULT_TASK_KEYS.map((key, index) => {
    const entry = TASK_CATALOG.find((c) => c.key === key)!;
    return {
      userId,
      key: entry.key,
      title: entry.title,
      recurrence: entry.recurrence,
      target: entry.defaultTarget,
      detectionSignal: entry.detectionSignal,
      enabled: true,
      removed: false,
      order: index,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  });

  if (docs.length > 0) await col.insertMany(docs);
}

async function enrichWithDetection(
  tasks: WithId<TaskDoc>[],
  userId: string,
  dayStart: string | undefined,
  dayEnd: string | undefined,
) {
  let platformsCounts: { done: number; total: number } | null = null;
  let appliedCount: number | null = null;
  let savedToday: boolean | null = null;
  let followupToday: boolean | null = null;
  let statusChangedToday: boolean | null = null;
  let coldAppliedToday: boolean | null = null;

  const dayRange = { $gte: new Date(dayStart ?? 0), $lt: new Date(dayEnd ?? 0) };

  async function getPlatformsCounts(): Promise<{ done: number; total: number }> {
    if (platformsCounts !== null) return platformsCounts;
    if (!dayStart) return (platformsCounts = { done: 0, total: 0 });
    const platformsCol = await getCollection('platforms');
    const total = await platformsCol.countDocuments({ userId });
    if (total === 0) return (platformsCounts = { done: 0, total: 0 });
    const done = await platformsCol.countDocuments({
      userId,
      checkedAt: { $gte: new Date(dayStart) },
    });
    return (platformsCounts = { done, total });
  }

  async function getAppliedTodayCount(): Promise<number> {
    if (appliedCount !== null) return appliedCount;
    if (!dayStart || !dayEnd) return (appliedCount = 0);
    const appsCol = await getCollection('applications');
    return (appliedCount = await appsCol.countDocuments({
      userId,
      appliedAt: { $gte: new Date(dayStart), $lt: new Date(dayEnd) },
    }));
  }

  async function isSavedToday(): Promise<boolean> {
    if (savedToday !== null) return savedToday;
    if (!dayStart || !dayEnd) return (savedToday = false);
    const appsCol = await getCollection('applications');
    const count = await appsCol.countDocuments({
      userId,
      status: 'saved',
      created_at: dayRange,
    });
    return (savedToday = count > 0);
  }

  async function isFollowupToday(): Promise<boolean> {
    if (followupToday !== null) return followupToday;
    if (!dayStart || !dayEnd) return (followupToday = false);
    const appsCol = await getCollection('applications');
    const count = await appsCol.countDocuments({
      userId,
      events: { $elemMatch: { type: { $in: ['followup_sent', 'thank_you_sent'] }, at: dayRange } },
    });
    return (followupToday = count > 0);
  }

  async function isStatusChangedToday(): Promise<boolean> {
    if (statusChangedToday !== null) return statusChangedToday;
    if (!dayStart || !dayEnd) return (statusChangedToday = false);
    const appsCol = await getCollection('applications');
    const count = await appsCol.countDocuments({
      userId,
      events: { $elemMatch: { type: { $in: STATUS_CHANGE_EVENTS }, at: dayRange } },
    });
    return (statusChangedToday = count > 0);
  }

  async function isColdAppliedToday(): Promise<boolean> {
    if (coldAppliedToday !== null) return coldAppliedToday;
    if (!dayStart || !dayEnd) return (coldAppliedToday = false);
    const appsCol = await getCollection('applications');
    const rows = await appsCol
      .aggregate([
        { $match: { userId, appliedAt: dayRange } },
        { $addFields: { jobPostingObjId: { $toObjectId: '$jobPostingId' } } },
        {
          $lookup: {
            from: 'job_postings',
            localField: 'jobPostingObjId',
            foreignField: '_id',
            as: 'jp',
          },
        },
        { $match: { 'jp.source': 'manual' } },
        { $limit: 1 },
      ])
      .toArray();
    return (coldAppliedToday = rows.length > 0);
  }

  async function isCvTouched(createdAt: Date): Promise<boolean> {
    const cvsCol = await getCollection('cvs');
    const count = await cvsCol.countDocuments({ userId, uploadedAt: { $gt: createdAt } });
    return count > 0;
  }

  return Promise.all(
    tasks.map(async (q) => {
      let detected = false;
      let progress: number | null = null;
      let progressTarget: number | null = null;

      const signal = q.key
        ? TASK_CATALOG.find((c) => c.key === q.key)?.detectionSignal ?? null
        : q.detectionSignal;

      if (signal === 'platforms_all') {
        const { done, total } = await getPlatformsCounts();
        detected = total > 0 && done === total;
        progress = done;
        progressTarget = total > 0 ? total : null;
      } else if (signal === 'applied_today') {
        const count = await getAppliedTodayCount();
        progress = q.target ? Math.min(count, q.target) : count;
        detected = q.target ? count >= q.target : count > 0;
      } else if (signal === 'saved_today') {
        detected = await isSavedToday();
      } else if (signal === 'followup_today') {
        detected = await isFollowupToday();
      } else if (signal === 'status_changed_today') {
        detected = await isStatusChangedToday();
      } else if (signal === 'cold_applied_today') {
        detected = await isColdAppliedToday();
      } else if (signal === 'cv_touched') {
        detected = await isCvTouched(q.createdAt);
      }

      return {
        ...q,
        _id: q._id.toString(),
        detected,
        progress,
        progressTarget,
      };
    }),
  );
}

export default defineHandler({
  GET: method({
    async handle({ user, query }) {
      const userId = user.id;
      await seedDefaultTasks(userId);

      const { dayStart, dayEnd } = query as { dayStart?: string; dayEnd?: string };
      const col = await getCollection<TaskDoc>('quest_templates');
      const tasks = await col.find({ userId }).sort({ order: 1, createdAt: 1 }).toArray();
      const enriched = await enrichWithDetection(tasks, userId, dayStart, dayEnd);

      return { json: { data: enriched } };
    },
  }),
  POST: method({
    async handle({ user, req }) {
      const userId = user.id;
      const col = await getCollection<TaskDoc>('quest_templates');
      const now = new Date();

      if (req.body && typeof req.body === 'object' && 'key' in req.body) {
        const parsed = ActivateCatalogTaskSchema.safeParse(req.body);
        if (!parsed.success) throw ApiError.validation(parsed.error.flatten());

        const entry = TASK_CATALOG.find((c) => c.key === parsed.data.key);
        if (!entry) throw ApiError.badRequest('Unknown catalog task');

        const existing = await col.findOne({ userId, key: entry.key });
        if (existing) {
          await col.updateOne(
            { _id: existing._id },
            { $set: { enabled: true, removed: false, updatedAt: now } },
          );
          return { json: { taskId: existing._id.toString() } };
        }

        const order = await col.countDocuments({ userId });
        const doc = {
          userId,
          key: entry.key,
          title: entry.title,
          recurrence: entry.recurrence,
          target: entry.defaultTarget,
          detectionSignal: entry.detectionSignal,
          enabled: true,
          removed: false,
          order,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        const result = await col.insertOne(doc);
        return { status: 201, json: { taskId: result.insertedId.toString() } };
      }

      const parsed = CreateCustomTaskSchema.safeParse(req.body);
      if (!parsed.success) throw ApiError.validation(parsed.error.flatten());

      const { title, recurrence, target } = parsed.data;
      const order = await col.countDocuments({ userId });
      const doc = {
        userId,
        key: null,
        title,
        recurrence,
        target: target ?? null,
        detectionSignal: null,
        enabled: true,
        removed: false,
        order,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const result = await col.insertOne(doc);
      return { status: 201, json: { taskId: result.insertedId.toString() } };
    },
  }),
  PATCH: method({
    async handle({ user, query, req }) {
      const userId = user.id;
      const { id } = query as { id?: string };
      const col = await getCollection<TaskDoc>('quest_templates');

      if (!id) {
        const parsed = ReorderTasksSchema.safeParse(req.body);
        if (!parsed.success) throw ApiError.validation(parsed.error.flatten());

        const ids = parsed.data.order;
        if (!ids.every((taskId) => ObjectId.isValid(taskId))) {
          throw ApiError.badRequest('Invalid id in order');
        }

        await Promise.all(
          ids.map((taskId, index) =>
            col.updateOne(
              { _id: new ObjectId(taskId), userId },
              { $set: { order: index, updatedAt: new Date() } },
            ),
          ),
        );
        return { json: { ok: true } };
      }

      if (!ObjectId.isValid(id)) throw ApiError.badRequest('Invalid id');

      const parsed = UpdateTaskSchema.safeParse(req.body);
      if (!parsed.success) throw ApiError.validation(parsed.error.flatten());

      const { title, recurrence, target, enabled, removed, completed } = parsed.data;
      const update: Record<string, unknown> = {};
      if (title !== undefined) update.title = title;
      if (recurrence !== undefined) update.recurrence = recurrence;
      if (target !== undefined) update.target = target;
      if (enabled !== undefined) update.enabled = enabled;
      if (removed !== undefined) update.removed = removed;
      if (completed !== undefined) update.completedAt = completed ? new Date() : null;

      if (Object.keys(update).length === 0) {
        throw ApiError.badRequest('Nothing to update');
      }
      update.updatedAt = new Date();

      const result = await col.updateOne({ _id: new ObjectId(id), userId }, { $set: update });
      if (result.matchedCount === 0) throw ApiError.notFound();
      return { json: { ok: true } };
    },
  }),
  DELETE: method({
    async handle({ user, query }) {
      const userId = user.id;
      const { id } = query as { id?: string };
      if (!id || !ObjectId.isValid(id)) throw ApiError.badRequest('Invalid id');

      const col = await getCollection<TaskDoc>('quest_templates');
      const task = await col.findOne({ _id: new ObjectId(id), userId });
      if (!task) throw ApiError.notFound();
      if (task.key !== null) {
        throw ApiError.badRequest('Une quête du catalogue ne peut être que désactivée');
      }

      await col.deleteOne({ _id: new ObjectId(id), userId });
      return { json: { ok: true } };
    },
  }),
});
