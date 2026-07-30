import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';
import {
  UrlScrapeHttpError,
  parseRetryRequest,
  retryApplicationFromUrl,
} from './scrape/index.js';

export default defineHandler({
  POST: method({
    async handle({ user, req }) {
      const parsed = parseRetryRequest(req.body);
      if (!parsed.success) throw ApiError.validation(parsed.error.flatten());

      try {
        const result = await retryApplicationFromUrl(user.id, parsed.data.applicationId);
        return { json: result };
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
