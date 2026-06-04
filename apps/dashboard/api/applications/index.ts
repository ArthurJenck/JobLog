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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  const userId = session.user.id;

  if (req.method === 'GET') {
    const col = await getCollection('applications');
    const jpCol = await getCollection('job_postings');

    const { status, search, limit = '100', offset = '0' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { userId };
    if (status) filter['status'] = { $in: status.split(',') };

    const applications = await col
      .find(filter)
      .sort({ created_at: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .toArray();

    const jobPostingIds = [...new Set(applications.map((a) => a.jobPostingId))];
    const jobPostings = await jpCol
      .find({ _id: { $in: jobPostingIds.map((id) => new ObjectId(String(id))) } })
      .toArray();
    const jpMap = new Map(jobPostings.map((jp) => [jp._id.toString(), jp]));

    let results = applications.map((app) => ({
      ...app,
      _id: app._id.toString(),
      jobPosting: jpMap.get(String(app.jobPostingId)) ?? null,
    }));

    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (a) =>
          String(a.jobPosting?.title ?? '').toLowerCase().includes(q) ||
          String(a.jobPosting?.company ?? '').toLowerCase().includes(q)
      );
    }

    return res.status(200).json({ data: results, total: results.length });
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
