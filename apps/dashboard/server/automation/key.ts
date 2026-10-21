import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';
import { createAutomationToken, hashAutomationToken } from './token.js';

export default defineHandler({
  GET: method({
    async handle({ user, req, res }) {
      if (req.headers.authorization) throw ApiError.unauthorized();
      res.setHeader('Cache-Control', 'no-store');
      const col = await getCollection('automation_tokens');
      const current = await col.findOne({ userId: user.id }, { projection: { createdAt: 1 } });
      return { json: { configured: Boolean(current), createdAt: current?.createdAt ?? null } };
    },
  }),
  POST: method({
    maintenanceSensitive: true,
    rateLimit: {
      max: 5,
      windowMs: 60 * 60 * 1000,
      scope: ({ user }) => `automation-key:${user!.id}`,
    },
    async handle({ user, req, res }) {
      if (req.headers.authorization) throw ApiError.unauthorized();
      res.setHeader('Cache-Control', 'no-store');
      const token = createAutomationToken();
      const col = await getCollection('automation_tokens');
      await col.updateOne(
        { userId: user.id },
        { $set: { tokenHash: hashAutomationToken(token), createdAt: new Date() } },
        { upsert: true },
      );
      return { json: { token } };
    },
  }),
  DELETE: method({
    maintenanceSensitive: true,
    async handle({ user, req, res }) {
      if (req.headers.authorization) throw ApiError.unauthorized();
      res.setHeader('Cache-Control', 'no-store');
      const col = await getCollection('automation_tokens');
      await col.deleteOne({ userId: user.id });
      return { json: { ok: true } };
    },
  }),
});
