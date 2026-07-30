import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';

export default defineHandler({
  GET: method({
    async handle({ user }) {
      const col = await getCollection('applications');
      const pipeline = [
        { $match: { userId: user.id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ];

      const results = await col.aggregate<{ _id: string; count: number }>(pipeline).toArray();
      const stats: Record<string, number> = {};
      let total = 0;
      for (const r of results) {
        stats[r._id] = r.count;
        total += r.count;
      }

      return { json: { total, ...stats } };
    },
  }),
});
