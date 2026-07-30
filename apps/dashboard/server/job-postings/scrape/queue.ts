import { QueueClient, registerDevConsumer, DuplicateMessageError } from '@vercel/queue';
import { z } from 'zod';
import { processUrlScrapeMessage } from './service.js';

export const URL_SCRAPE_TOPIC = 'joblog-url-scrape';

const queue = new QueueClient();
let didRegisterDevConsumer = false;

export const UrlScrapeJobMessageSchema = z.object({
  jobPostingId: z.string(),
  userId: z.string(),
  url: z.string().url(),
  url_hash: z.string(),
  attempt: z.number().int().positive(),
});

export type UrlScrapeJobMessage = z.infer<typeof UrlScrapeJobMessageSchema>;

export async function enqueueUrlScrapeJob(message: UrlScrapeJobMessage) {
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
