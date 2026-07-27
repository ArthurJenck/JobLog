import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';

const CreatePlatformSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  domain: z.string().min(1).nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
});

const UpdatePlatformSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  const userId = session.user.id;
  const col = await getCollection('platforms');

  if (req.method === 'GET') {
    const platforms = await col.find({ userId }).sort({ createdAt: -1 }).toArray();
    return res.status(200).json({
      data: platforms.map((p) => ({ ...p, _id: p._id.toString() })),
    });
  }

  if (req.method === 'POST') {
    const parsed = CreatePlatformSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { url, name, domain, faviconUrl } = parsed.data;
    const now = new Date();

    const doc = {
      userId,
      name,
      url,
      domain: domain ?? null,
      faviconUrl: faviconUrl ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const result = await col.insertOne(doc);
    return res.status(201).json({ platformId: result.insertedId.toString() });
  }

  if (req.method === 'PATCH') {
    const { id } = req.query as { id: string };
    if (!id || !ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const parsed = UpdatePlatformSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    if (Object.keys(parsed.data).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const result = await col.updateOne(
      { _id: new ObjectId(id), userId },
      { $set: { ...parsed.data, updatedAt: new Date() } },
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query as { id: string };
    if (!id || !ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const result = await col.deleteOne({ _id: new ObjectId(id), userId });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
