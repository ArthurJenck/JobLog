import { TERMINAL_STATUSES } from '@joblog/shared';
import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';

export default defineHandler({
  GET: method({
    async handle({ user }) {
      const col = await getCollection('applications');
      const now = new Date();

      const count = await col.countDocuments({
        userId: user.id,
        'reminder.at': { $lte: now },
        $expr: { $lt: ['$reminder.sentCount', '$reminder.maxCount'] },
        $or: [
          { 'reminder.snoozedUntil': null },
          { 'reminder.snoozedUntil': { $lte: now } },
        ],
        status: { $nin: [...TERMINAL_STATUSES, 'offer'] },
      });

      return { json: { count } };
    },
  }),
});
