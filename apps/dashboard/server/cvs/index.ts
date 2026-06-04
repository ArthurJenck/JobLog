import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';
import { sha256 } from '../../lib/hash.js';

const CreateCvSchema = z.object({
  label: z.string().min(1),
  filename: z.string().min(1),
  content: z.string().min(1),
});

const RenameCvSchema = z.object({
  label: z.string().min(1),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  const userId = session.user.id;
  const col = await getCollection('cvs');

  if (req.method === 'GET') {
    const cvs = await col.find({ userId }).sort({ uploadedAt: -1 }).toArray();
    return res.status(200).json({
      data: cvs.map((cv) => ({ ...cv, _id: cv._id.toString(), content: undefined })),
    });
  }

  if (req.method === 'POST') {
    const parsed = CreateCvSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { label, filename, content } = parsed.data;
    const content_hash = sha256(content);

    const doc = {
      userId,
      label,
      filename,
      content,
      content_hash,
      uploadedAt: new Date(),
    };

    const result = await col.insertOne(doc);
    return res.status(201).json({ cvId: result.insertedId.toString() });
  }

  if (req.method === 'PATCH') {
    const { id } = req.query as { id: string };
    if (!id || !ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const parsed = RenameCvSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await col.updateOne(
      { _id: new ObjectId(id), userId },
      { $set: { label: parsed.data.label } },
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
