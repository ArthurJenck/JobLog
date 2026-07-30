import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { sha256 } from '../../lib/hash.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';
import { withStringId } from '../../lib/http/serialize.js';

const CreateCvSchema = z.object({
  label: z.string().min(1),
  filename: z.string().min(1),
  content: z.string().min(1),
});

const UpdateCvSchema = z.object({
  label: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
});

export default defineHandler({
  GET: method({
    async handle({ user }) {
      const col = await getCollection('cvs');
      const cvs = await col.find({ userId: user.id }).sort({ uploadedAt: -1 }).toArray();
      return {
        json: { data: cvs.map((cv) => ({ ...withStringId(cv), content: undefined })) },
      };
    },
  }),
  POST: method({
    body: CreateCvSchema,
    async handle({ user, body }) {
      const { label, filename, content } = body;
      const content_hash = sha256(content);

      const doc = {
        userId: user.id,
        label,
        filename,
        content,
        content_hash,
        uploadedAt: new Date(),
      };

      const col = await getCollection('cvs');
      const result = await col.insertOne(doc);
      return { status: 201, json: { cvId: result.insertedId.toString() } };
    },
  }),
  PATCH: method({
    body: UpdateCvSchema,
    async handle({ user, query, body }) {
      const { id } = query as { id?: string };
      if (!id || !ObjectId.isValid(id)) throw ApiError.badRequest('Invalid id');

      const { label, isDefault } = body;
      const col = await getCollection('cvs');

      if (isDefault) {
        await col.updateMany({ userId: user.id }, { $set: { isDefault: false } });
      }

      const update: Record<string, unknown> = {};
      if (label !== undefined) update.label = label;
      if (isDefault !== undefined) update.isDefault = isDefault;

      const result = await col.updateOne(
        { _id: new ObjectId(id), userId: user.id },
        { $set: update },
      );
      if (result.matchedCount === 0) throw ApiError.notFound();
      return { json: { ok: true } };
    },
  }),
  DELETE: method({
    async handle({ user, query }) {
      const { id } = query as { id?: string };
      if (!id || !ObjectId.isValid(id)) throw ApiError.badRequest('Invalid id');

      const col = await getCollection('cvs');
      const result = await col.deleteOne({ _id: new ObjectId(id), userId: user.id });
      if (result.deletedCount === 0) throw ApiError.notFound();
      return { json: { ok: true } };
    },
  }),
});
