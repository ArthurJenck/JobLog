import { defineHandler, method } from '../../lib/http/define-handler.js';
import { requireAdminWebSession } from '../../lib/admin-auth.js';
import { ApiError } from '../../lib/http/errors.js';

export default defineHandler({
  GET: method({
    auth: 'public',
    async handle({ req }) {
      try {
        await requireAdminWebSession(req);
        return { json: { isAdmin: true } };
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          return { json: { isAdmin: false } };
        }
        throw error;
      }
    },
  }),
});
