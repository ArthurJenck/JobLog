import { ObjectId } from 'mongodb';
import { getCollection } from '../../lib/db.js';
import { requireAdminWebSession } from '../../lib/admin-auth.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';

export default defineHandler({
  POST: method({
    auth: 'public',
    body: undefined,
    rateLimit: { max: 10, windowMs: 60_000 },
    async handle({ req }) {
      const admin = await requireAdminWebSession(req, { mutation: true });
      const now = new Date();
      const acceptsUntil = new Date(now.getTime() + 5 * 60_000);
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60_000);
      const id = new ObjectId();

      const sessions = await getCollection('extension_fixture_sessions');
      await sessions.updateMany(
        { adminId: admin.id, status: 'open' },
        { $set: { status: 'replaced' } },
      );
      await sessions.insertOne({
        _id: id,
        adminId: admin.id,
        status: 'open',
        snapshot: null,
        createdAt: now,
        acceptsUntil,
        expiresAt,
      });

      return {
        status: 201,
        json: {
          sessionId: id.toString(),
          acceptsUntil: acceptsUntil.toISOString(),
          expiresAt: expiresAt.toISOString(),
        },
      };
    },
  }),
});
