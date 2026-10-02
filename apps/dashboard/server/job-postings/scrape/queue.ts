import { QueueClient, registerDevConsumer, DuplicateMessageError } from '@vercel/queue';
import {
  UrlScrapeMessageSchema,
  type UrlScrapeMessage,
  type UrlScrapeMessageV2,
} from '@joblog/shared';
import { processUrlScrapeMessage } from './service.js';
import {
  MIGRATION_RETRY_AFTER_SECONDS,
  MigrationMaintenanceError,
} from '../../migrations/maintenance.js';

export const URL_SCRAPE_TOPIC = 'joblog-url-scrape';

const queue = new QueueClient();
let didRegisterDevConsumer = false;

export const UrlScrapeJobMessageSchema = UrlScrapeMessageSchema;
export type UrlScrapeJobMessage = UrlScrapeMessage;

export async function enqueueUrlScrapeJob(message: UrlScrapeMessageV2) {
  ensureDevConsumerRegistered();

  try {
    const result = await queue.send(URL_SCRAPE_TOPIC, message, {
      idempotencyKey: `url-scrape:${message.jobPostingId}:${message.attempt}`,
      retentionSeconds: 86400,
    });
    return result.messageId;
  } catch (err) {
    if (err instanceof DuplicateMessageError) return null;
    throw err;
  }
}

function ensureDevConsumerRegistered() {
  if (process.env.NODE_ENV !== 'development' || didRegisterDevConsumer) return;

  registerDevConsumer({
    topic: URL_SCRAPE_TOPIC,
    client: queue,
    consumerGroup: 'joblog-url-scrape-dev',
    visibilityTimeoutSeconds: 300,
    retry: (_error, metadata) => {
      if (_error instanceof MigrationMaintenanceError) {
        return { afterSeconds: MIGRATION_RETRY_AFTER_SECONDS };
      }
      if (metadata.deliveryCount > 3) return { acknowledge: true };
      return { afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5) };
    },
    handler: async (message, metadata) => {
      const parsed = UrlScrapeJobMessageSchema.safeParse(message);
      if (!parsed.success) {
        console.warn('[queue/scrape-url:dev] invalid message', parsed.error.flatten());
        return;
      }

      await processUrlScrapeMessage(parsed.data, metadata);
    },
  });

  didRegisterDevConsumer = true;
}
