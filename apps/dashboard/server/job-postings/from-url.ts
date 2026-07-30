import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';
import {
  UrlScrapeHttpError,
  createApplicationFromUrl,
  getFromUrlMeta,
  parseFromUrlRequest,
} from './scrape/index.js';

export default defineHandler({
  GET: method({
    async handle({ user }) {
      return { json: await getFromUrlMeta(user.id) };
    },
  }),
  POST: method({
    async handle({ user, req }) {
      const parsed = parseFromUrlRequest(req.body);
      if (!parsed.success) throw ApiError.validation(parsed.error.flatten());

      try {
        const result = await createApplicationFromUrl(user.id, parsed.data.url);
        return { status: result.cached ? 200 : 201, json: result };
      } catch (err) {
        if (err instanceof UrlScrapeHttpError) {
          throw new ApiError(err.status, err.code, err.message, {
            extra: { usage: err.usage, extensionUrl: err.extensionUrl },
          });
        }
        throw err;
      }
    },
  }),
});
