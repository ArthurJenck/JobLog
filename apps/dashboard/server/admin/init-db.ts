import { ensureIndexes } from '../../lib/db-init.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';

export default defineHandler({
  POST: method({
    auth: 'cron',
    async handle() {
      await ensureIndexes();
      return { json: { ok: true } };
    },
  }),
});
