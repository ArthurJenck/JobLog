import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';
import { buildStatusChangeUpdates } from '../../lib/application-status.js';
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

interface ApplicationStatusDoc {
  _id: ObjectId;
  userId: string;
  status: ApplicationStatus;
  appliedAt?: Date | null;
  events?: Array<{ type: EventType; at: Date; meta: unknown }>;
  reminder?: { at?: Date | null; frequencyDays?: number } | null;
}

const SORT_FIELD_MAP: Record<string, string> = {
  title: 'title',
  company: 'company',
  status: 'status',
  nextInterview: 'nextInterview',
  reminder: 'reminder.at',
  appliedAt: 'effectiveDate',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await _handler(req, res);
  } catch (err) {
    console.error('[applications] unhandled error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function _handler(req: VercelRequest, res: VercelResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  const userId = session.user.id;

  if (req.method === 'GET') {
    const {
      status,
      search,
      dateFrom,
      dateTo,
      sort = 'appliedAt',
      dir = 'desc',
      page = '1',
      pageSize = '25',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, Number(page));
    const pageSizeNum = Math.min(100, Math.max(1, Number(pageSize)));
    const skip = (pageNum - 1) * pageSizeNum;

    const sortField = SORT_FIELD_MAP[sort] ?? 'effectiveDate';
    const sortDir = dir === 'asc' ? 1 : -1;

    const pipeline: object[] = [];

    const initialMatch: Record<string, unknown> = { userId };
    if (status) initialMatch['status'] = { $in: status.split(',') };
    pipeline.push({ $match: initialMatch });

    pipeline.push({
      $addFields: {
        effectiveDate: { $ifNull: ['$appliedAt', '$created_at'] },
      },
    });

    if (dateFrom || dateTo) {
      const dateMatch: Record<string, unknown> = {};
      if (dateFrom) dateMatch['$gte'] = new Date(dateFrom + 'T00:00:00');
      if (dateTo) dateMatch['$lte'] = new Date(dateTo + 'T23:59:59');
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

    return res.status(200).json({ data: results, total, page: pageNum, pageSize: pageSizeNum });
  }

  if (req.method === 'PATCH') {
    const { cancelAll, excludeId, bulkStatus, bulkDelete } = req.body as {
      cancelAll?: boolean;
      excludeId?: string;
      bulkStatus?: { ids: string[]; status: ApplicationStatus };
      bulkDelete?: { ids: string[] };
    };

    if (cancelAll) {
      const filter: Record<string, unknown> = { userId, status: { $in: ACTIVE_STATUSES } };
      if (excludeId && ObjectId.isValid(excludeId)) {
        filter['_id'] = { $ne: new ObjectId(excludeId) };
      }
      const col2 = await getCollection('applications');
      await col2.updateMany(filter, { $set: { status: 'cancelled', 'reminder.at': null, updated_at: new Date() } });
      return res.status(200).json({ ok: true });
    }

    if (bulkStatus) {
      const parsed = BulkStatusSchema.safeParse(bulkStatus);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const objectIds = parsed.data.ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
      if (objectIds.length === 0) return res.status(200).json({ ok: true, updated: 0 });

      const col2 = await getCollection<ApplicationStatusDoc>('applications');
      const docs = await col2.find({ userId, _id: { $in: objectIds } }).toArray();
      await Promise.all(
        docs.map((doc) =>
          col2.updateOne({ _id: doc._id }, { $set: buildStatusChangeUpdates(doc, parsed.data.status) }),
        ),
      );
      return res.status(200).json({ ok: true, updated: docs.length });
    }

    if (bulkDelete) {
      const parsed = BulkDeleteSchema.safeParse(bulkDelete);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const objectIds = parsed.data.ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
      if (objectIds.length === 0) return res.status(200).json({ ok: true, deleted: 0 });

      const col2 = await getCollection('applications');
      const result = await col2.deleteMany({ userId, _id: { $in: objectIds } });
      return res.status(200).json({ ok: true, deleted: result.deletedCount });
    }

    return res.status(400).json({ error: 'Invalid patch body' });
  }

  if (req.method === 'POST') {
    const parsed = CreateApplicationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { jobPostingId, status, cvId } = parsed.data;

    const col = await getCollection('applications');

    const existing = await col.findOne({ userId, jobPostingId });
    if (existing) {
      return res.status(200).json({ applicationId: existing._id.toString(), duplicate: true });
    }

    const now = new Date();
    const reminderFrequencyDays = 7;
    const doc = {
      userId,
      jobPostingId,
      cvId: cvId ?? null,
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
    return res.status(201).json({ applicationId: result.insertedId.toString() });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
