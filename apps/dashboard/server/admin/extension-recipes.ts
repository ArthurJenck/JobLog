import { defineHandler, method } from '../../lib/http/define-handler.js';
import { getCollection } from '../../lib/db.js';
import { requireAdminWebSession } from '../../lib/admin-auth.js';

export default defineHandler({
  GET: method({
    auth: 'public',
    rateLimit: { max: 60, windowMs: 60_000 },
    async handle({ req }) {
      await requireAdminWebSession(req);
      const recipes = await (await getCollection('extension_recipes'))
        .find({})
        .sort({ recipeKey: 1 })
        .toArray();

      return {
        json: {
          data: recipes.map(({ _id, ...recipe }) => ({ ...recipe, _id: _id.toString() })),
        },
      };
    },
  }),
});
