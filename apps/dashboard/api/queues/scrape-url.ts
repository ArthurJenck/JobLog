import { QueueClient } from '@vercel/queue';
import {
  UrlScrapeJobMessageSchema,
  processUrlScrapeMessage,
} from '../../server/job-postings/url-scrape-service.js';

const queue = new QueueClient();

export default queue.handleNodeCallback(
  async (message, metadata) => {
    const parsed = UrlScrapeJobMessageSchema.safeParse(message);
    if (!parsed.success) {
      console.warn('[queue/scrape-url] invalid message', parsed.error.flatten());
      return;
    }

    await processUrlScrapeMessage(parsed.data, metadata);
  },
  {
    visibilityTimeoutSeconds: 300,
    retry: (_error, metadata) => {
      if (metadata.deliveryCount > 3) return { acknowledge: true };
      return { afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5) };
    },
  },
);
