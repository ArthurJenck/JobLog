import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';
import { getAutomationUserId } from './token.js';

export default defineHandler({
  GET: method({
    auth: 'public',
    async handle({ req, res }) {
      res.setHeader('Cache-Control', 'no-store');
      const userId = await getAutomationUserId(req.headers.authorization);
      if (!userId) throw ApiError.unauthorized();

      const col = await getCollection('platforms');
      const platforms = await col
        .find({ userId }, { projection: { name: 1, url: 1, order: 1 } })
        .sort({ order: 1, createdAt: -1 })
        .toArray();

      return {
        json: {
          data: platforms.map(({ _id, name, url, order }) => ({
            id: _id.toString(),
            name,
            url,
            order,
          })),
        },
      };
    },
  }),
});
