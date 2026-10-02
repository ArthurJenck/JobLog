import { getCollection } from '../../lib/db.js';
import { getEnv } from '../../lib/env.js';
import { normalizeAdminEmail } from '../../lib/admin-auth.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';

export default defineHandler({
  GET: method({
    rateLimit: { max: 60, windowMs: 60_000, scope: ({ user }) => `extension-fixture:${user!.id}` },
    async handle({ user }) {
      const adminId = getEnv('ADMIN_USER_ID')?.trim();
      const adminEmail = normalizeAdminEmail(getEnv('ADMIN_MAIL'));
      if (!adminId || !adminEmail || user.id !== adminId || user.email.trim().toLowerCase() !== adminEmail) {
        return { json: { session: null } };
      }

      const session = await (await getCollection('extension_fixture_sessions')).findOne(
        {
          adminId: user.id,
          status: 'open',
          acceptsUntil: { $gt: new Date() },
        },
        { sort: { createdAt: -1 } },
      );

      return {
        json: {
          session: session
            ? { id: session._id.toString(), acceptsUntil: session.acceptsUntil }
            : null,
        },
      };
    },
  }),
});
