import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';
import { withStringIds } from '../../lib/http/serialize.js';

const CreatePlatformSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  domain: z.string().min(1).nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
});

const UpdatePlatformSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  clicked: z.literal(true).optional(),
  checked: z.boolean().optional(),
});

const ReorderPlatformsSchema = z.object({
  order: z.array(z.string()).min(1),
});

const ClickAllPlatformsSchema = z.object({
  clickAll: z.literal(true),
});

export default defineHandler({
  GET: method({
    async handle({ user }) {
      const col = await getCollection('platforms');
      const platforms = await col.find({ userId: user.id }).sort({ order: 1, createdAt: -1 }).toArray();
      return { json: { data: withStringIds(platforms) } };
    },
  }),
  POST: method({
    body: CreatePlatformSchema,
    async handle({ user, body }) {
      const { url, name, domain, faviconUrl } = body;
      const col = await getCollection('platforms');
      const now = new Date();
      const order = await col.countDocuments({ userId: user.id });

      const doc = {
        userId: user.id,
        name,
        url,
        domain: domain ?? null,
        faviconUrl: faviconUrl ?? null,
        order,
        lastClickedAt: null,
        checkedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const result = await col.insertOne(doc);
      return { status: 201, json: { platformId: result.insertedId.toString() } };
    },
  }),
  PATCH: method({
    async handle({ user, query, req }) {
      const { id } = query as { id?: string };
      const col = await getCollection('platforms');

      if (!id) {
        if (req.body && typeof req.body === 'object' && 'clickAll' in req.body) {
          const parsed = ClickAllPlatformsSchema.safeParse(req.body);
          if (!parsed.success) throw ApiError.validation(parsed.error.flatten());

          await col.updateMany(
            { userId: user.id },
            { $set: { lastClickedAt: new Date(), updatedAt: new Date() } },
          );
          return { json: { ok: true } };
        }

        const parsed = ReorderPlatformsSchema.safeParse(req.body);
        if (!parsed.success) throw ApiError.validation(parsed.error.flatten());

        const ids = parsed.data.order;
        if (!ids.every((platformId) => ObjectId.isValid(platformId))) {
          throw ApiError.badRequest('Invalid id in order');
        }

        await Promise.all(
          ids.map((platformId, index) =>
            col.updateOne(
              { _id: new ObjectId(platformId), userId: user.id },
              { $set: { order: index, updatedAt: new Date() } },
            ),
          ),
        );
        return { json: { ok: true } };
      }

      if (!ObjectId.isValid(id)) throw ApiError.badRequest('Invalid id');

      const parsed = UpdatePlatformSchema.safeParse(req.body);
      if (!parsed.success) throw ApiError.validation(parsed.error.flatten());

      const { name, url, clicked, checked } = parsed.data;
      const update: Record<string, unknown> = {};
      if (name !== undefined) update.name = name;
      if (url !== undefined) update.url = url;
      if (clicked) update.lastClickedAt = new Date();
      if (checked !== undefined) update.checkedAt = checked ? new Date() : null;

      if (Object.keys(update).length === 0) {
        throw ApiError.badRequest('Nothing to update');
      }
      update.updatedAt = new Date();

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

      const col = await getCollection('platforms');
      const result = await col.deleteOne({ _id: new ObjectId(id), userId: user.id });
      if (result.deletedCount === 0) throw ApiError.notFound();
      return { json: { ok: true } };
    },
  }),
});
