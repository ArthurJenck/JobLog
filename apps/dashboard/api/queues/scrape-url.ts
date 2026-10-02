import { QueueClient } from '@vercel/queue';
import {
  UrlScrapeJobMessageSchema,
  processUrlScrapeMessage,
} from '../../server/job-postings/scrape/index.js';
import {
  MIGRATION_RETRY_AFTER_SECONDS,
  MigrationMaintenanceError,
} from '../../server/migrations/maintenance.js';

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
      if (_error instanceof MigrationMaintenanceError) {
        return { afterSeconds: MIGRATION_RETRY_AFTER_SECONDS };
      }
      if (metadata.deliveryCount > 3) return { acknowledge: true };
      return { afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5) };
    },
  },
);
