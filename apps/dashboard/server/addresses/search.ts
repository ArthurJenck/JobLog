import { z } from 'zod';
import { searchAddressSuggestions } from '../../lib/addresses.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';

const QuerySchema = z.object({
  q: z.string().trim().min(3).max(120),
});

export default defineHandler({
  GET: method({
    query: QuerySchema,
    rateLimit: {
      max: 60,
      windowMs: 60 * 1000,
      scope: ({ user }) => `addresses-search:${user!.id}`,
    },
    async handle({ query }) {
      try {
        const data = await searchAddressSuggestions(query.q);
        return { json: { data } };
      } catch {
        throw new ApiError(502, 'internal_error', 'Address search unavailable');
      }
    },
  }),
});
