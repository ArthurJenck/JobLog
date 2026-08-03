import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { buildStatusChangeUpdates } from '../../lib/application-status.js';
import { getReminderDefaultDays } from '../../lib/notification-settings.js';
import {
  APPLICATION_STATUSES,
  ACTIVE_STATUSES,
  REMINDER_ELIGIBLE_STATUSES,
  INTERVIEW_CONCLUDING_EVENTS,
  type ApplicationStatus,
  type EventType,
} from '@joblog/shared';

const CreateApplicationSchema = z.object({
  jobPostingId: z.string(),
  status: z.enum(APPLICATION_STATUSES).default('saved'),
  cvId: z.string().nullable().optional(),
});

const BulkStatusSchema = z.object({
  ids: z.array(z.string()).min(1),
  status: z.enum(APPLICATION_STATUSES),
});

const BulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1),
});

const PatchBodySchema = z.union([
  z.object({ cancelAll: z.literal(true), excludeId: z.string().optional() }),
  z.object({ bulkStatus: BulkStatusSchema }),
  z.object({ bulkDelete: BulkDeleteSchema }),
]);

const DateParamSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const STATUS_SET = new Set<string>(APPLICATION_STATUSES);

function parseStatusFilter(raw: unknown): ApplicationStatus[] {
  const parts = Array.isArray(raw)
    ? raw.flatMap((value) => String(value).split(','))
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  return parts
    .map((value) => value.trim())
    .filter((value): value is ApplicationStatus => STATUS_SET.has(value));
}

interface ApplicationStatusDoc {
  _id: ObjectId;
  userId: string;
  status: ApplicationStatus;
  appliedAt?: Date | null;
  events?: Array<{ type: EventType; at: Date; meta: unknown }>;
  reminder?: { at?: Date | null; frequencyDays?: number } | null;
}

async function resolveDefaultCvId(userId: string): Promise<string | null> {
  const cvCol = await getCollection('cvs');
  const cvs = await cvCol.find({ userId }, { projection: { _id: 1, isDefault: 1 } }).toArray();
  if (cvs.length === 0) return null;
  const defaultCv = cvs.find((cv) => cv.isDefault) ?? (cvs.length === 1 ? cvs[0] : null);
  return defaultCv ? defaultCv._id.toString() : null;
}

const SORT_FIELD_MAP: Record<string, string> = {
  title: 'title',
  company: 'company',
  status: 'status',
  nextInterview: 'nextInterview',
  reminder: 'reminder.at',
  appliedAt: 'effectiveDate',
};

export default defineHandler({
  GET: method({
    async handle({ user, query }) {
      const userId = user.id;
      const {
        status,
        search,
        dateFrom,
        dateTo,
        sort = 'appliedAt',
        dir = 'desc',
        page = '1',
        pageSize = '25',
      } = query as Record<string, string>;

      const pageNum = Math.max(1, Number(page));
      const pageSizeNum = Math.min(100, Math.max(1, Number(pageSize)));
      const skip = (pageNum - 1) * pageSizeNum;

      const sortField = SORT_FIELD_MAP[sort] ?? 'effectiveDate';
      const sortDir = dir === 'asc' ? 1 : -1;

      const pipeline: object[] = [];

      const initialMatch: Record<string, unknown> = { userId };
      const statusValues = parseStatusFilter(status);
      if (statusValues.length) initialMatch['status'] = { $in: statusValues };
      pipeline.push({ $match: initialMatch });

      pipeline.push({
        $addFields: {
          effectiveDate: { $ifNull: ['$appliedAt', '$created_at'] },
        },
      });

      const validDateFrom = DateParamSchema.safeParse(dateFrom).success ? dateFrom : undefined;
      const validDateTo = DateParamSchema.safeParse(dateTo).success ? dateTo : undefined;
      if (validDateFrom || validDateTo) {
        const dateMatch: Record<string, unknown> = {};
        if (validDateFrom) dateMatch['$gte'] = new Date(validDateFrom + 'T00:00:00');
        if (validDateTo) dateMatch['$lte'] = new Date(validDateTo + 'T23:59:59');
        pipeline.push({ $match: { effectiveDate: dateMatch } });
      }

      pipeline.push({
        $lookup: {
          from: 'job_postings',
          let: { jpId: '$jobPostingId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', { $toObjectId: '$$jpId' }] } } },
          ],
          as: 'jobPosting',
        },
      });

      pipeline.push({
        $addFields: {
          jobPosting: { $first: '$jobPosting' },
          title: { $first: '$jobPosting.title' },
          company: { $first: '$jobPosting.company' },
          nextInterview: {
            $let: {
              vars: {
                sched: {
                  $max: {
                    $map: {
                      input: {
                        $filter: {
                          input: { $ifNull: ['$events', []] },
                          cond: { $eq: ['$$this.type', 'interview_scheduled'] },
                        },
                      },
                      in: '$$this.at',
                    },
                  },
                },
              },
              in: {
                $cond: [
                  {
                    $anyElementTrue: {
                      $map: {
                        input: {
                          $filter: {
                            input: { $ifNull: ['$events', []] },
                            cond: {
                              $and: [
                                {
                                  $in: [
                                    '$$this.type',
                                    INTERVIEW_CONCLUDING_EVENTS,
                                  ],
                                },
                                { $gt: ['$$this.at', '$$sched'] },
                              ],
                            },
                          },
                        },
                        in: true,
                      },
                    },
                  },
                  null,
                  '$$sched',
                ],
              },
            },
          },
        },
      });

      if (search) {
        const q = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        pipeline.push({
          $match: {
            $or: [
              { title: { $regex: q, $options: 'i' } },
              { company: { $regex: q, $options: 'i' } },
            ],
          },
        });
      }

      pipeline.push({
        $facet: {
          data: [
            { $sort: { [sortField]: sortDir } },
            { $skip: skip },
            { $limit: pageSizeNum },
          ],
          total: [{ $count: 'count' }],
        },
      });

      const col = await getCollection('applications');
      const [facet] = await col.aggregate(pipeline).toArray();

      const total: number = facet?.total?.[0]?.count ?? 0;
      const results = (facet?.data ?? []).map((app: Record<string, unknown>) => ({
        ...app,
        _id: (app._id as ObjectId).toString(),
        jobPosting: app.jobPosting
          ? {
              ...(app.jobPosting as Record<string, unknown>),
              _id: ((app.jobPosting as Record<string, unknown>)._id as ObjectId).toString(),
            }
          : null,
      }));

      return { json: { data: results, total, page: pageNum, pageSize: pageSizeNum } };
    },
  }),
  PATCH: method({
    body: PatchBodySchema,
    async handle({ user, body }) {
      const userId = user.id;

      if ('cancelAll' in body) {
        const filter: Record<string, unknown> = { userId, status: { $in: ACTIVE_STATUSES } };
        if (body.excludeId && ObjectId.isValid(body.excludeId)) {
          filter['_id'] = { $ne: new ObjectId(body.excludeId) };
        }
        const col2 = await getCollection('applications');
        await col2.updateMany(filter, { $set: { status: 'cancelled', 'reminder.at': null, updated_at: new Date() } });
        return { json: { ok: true } };
      }

      if ('bulkStatus' in body) {
        const { ids, status: bulkNewStatus } = body.bulkStatus;
        const objectIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
        if (objectIds.length === 0) return { json: { ok: true, updated: 0 } };

        const col2 = await getCollection<ApplicationStatusDoc>('applications');
        const docs = await col2.find({ userId, _id: { $in: objectIds } }).toArray();
        const defaultFrequencyDays = await getReminderDefaultDays(userId);
        await Promise.all(
          docs.map((doc) =>
            col2.updateOne(
              { _id: doc._id },
              { $set: buildStatusChangeUpdates(doc, bulkNewStatus, defaultFrequencyDays) },
            ),
          ),
        );
        return { json: { ok: true, updated: docs.length } };
      }

      const objectIds = body.bulkDelete.ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
      if (objectIds.length === 0) return { json: { ok: true, deleted: 0 } };

      const col2 = await getCollection('applications');
      const result = await col2.deleteMany({ userId, _id: { $in: objectIds } });
      return { json: { ok: true, deleted: result.deletedCount } };
    },
  }),
  POST: method({
    body: CreateApplicationSchema,
    async handle({ user, body }) {
      const userId = user.id;
      const { jobPostingId, status, cvId } = body;

      const col = await getCollection('applications');

      const existing = await col.findOne({ userId, jobPostingId });
      if (existing) {
        return { json: { applicationId: existing._id.toString(), duplicate: true } };
      }

      const now = new Date();
      const reminderFrequencyDays = await getReminderDefaultDays(userId);
      const doc = {
        userId,
        jobPostingId,
        cvId: cvId ?? await resolveDefaultCvId(userId),
        status,
        appliedAt: status === 'applied' ? now : null,
        contact: null,
        notes: null,
        events: [{ type: 'created', at: now, meta: null }],
        reminder: {
          at: REMINDER_ELIGIBLE_STATUSES.includes(status)
            ? new Date(now.getTime() + reminderFrequencyDays * 24 * 60 * 60 * 1000)
            : null,
          frequencyDays: reminderFrequencyDays,
          maxCount: 3,
          sentCount: 0,
          snoozedUntil: null,
        },
        created_at: now,
        updated_at: now,
      };

      const result = await col.insertOne(doc);
      return { status: 201, json: { applicationId: result.insertedId.toString() } };
    },
  }),
});
