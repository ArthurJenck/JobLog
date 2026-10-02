import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';
import { captureExtensionPage } from './capture-service.js';
import { ExtensionSnapshotSchema } from './schemas.js';

export default defineHandler({
  POST: method({
    maintenanceSensitive: true,
    body: ExtensionSnapshotSchema,
    rateLimit: { max: 60, windowMs: 60_000, scope: ({ user }) => `extension-capture:${user!.id}` },
    async handle({ user, body, req }) {
      if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > 750 * 1024) {
        throw ApiError.badRequest('Snapshot trop volumineux', 'snapshot_too_large');
      }
      return { json: await captureExtensionPage(user.id, body) };
    },
  }),
});
