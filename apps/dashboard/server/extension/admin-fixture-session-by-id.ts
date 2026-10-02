import { ObjectId } from 'mongodb';
import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';
import { ExtensionSnapshotSchema } from './schemas.js';

export default defineHandler({
  POST: method({
    body: ExtensionSnapshotSchema,
    rateLimit: { max: 10, windowMs: 60_000, scope: ({ user }) => `extension-fixture-upload:${user!.id}` },
    async handle({ user, query, body, req }) {
      const { id } = query as { id?: string };
      if (!id || !ObjectId.isValid(id)) throw ApiError.badRequest('Session invalide');
      if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > 750 * 1024) {
        throw ApiError.badRequest('Snapshot trop volumineux', 'snapshot_too_large');
      }

      const now = new Date();
      const result = await (await getCollection('extension_fixture_sessions')).updateOne(
        {
          _id: new ObjectId(id),
          adminId: user.id,
          status: 'open',
          acceptsUntil: { $gt: now },
        },
        {
          $set: {
            snapshot: body,
            status: 'captured',
            capturedAt: now,
          },
        },
      );
      if (result.matchedCount === 0) throw ApiError.notFound('Session de test introuvable ou expirée');

      return { json: { ok: true } };
    },
  }),
});
