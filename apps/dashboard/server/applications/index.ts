import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';
import { APPLICATION_STATUSES, ACTIVE_STATUSES } from '@joblog/shared';

const CreateApplicationSchema = z.object({
  jobPostingId: z.string(),
  status: z.enum(APPLICATION_STATUSES).default('saved'),
  cvId: z.string().nullable().optional(),
});

const SORT_FIELD_MAP: Record<string, string> = {
  title: 'title',
  company: 'company',
  status: 'status',
  nextInterview: 'nextInterview',
  reminder: 'reminder.at',
  appliedAt: 'effectiveDate',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    const { cancelAll, excludeId } = req.body as { cancelAll?: boolean; excludeId?: string };
    if (cancelAll) {
      const filter: Record<string, unknown> = { userId, status: { $in: ACTIVE_STATUSES } };
      if (excludeId && ObjectId.isValid(excludeId)) {
        filter['_id'] = { $ne: new ObjectId(excludeId) };
      }
      const col2 = await getCollection('applications');
      await col2.updateMany(filter, { $set: { status: 'cancelled', 'reminder.at': null, updated_at: new Date() } });
      return res.status(200).json({ ok: true });
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
        at: null,
        frequencyDays: 7,
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
