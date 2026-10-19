import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCollection } from '../../lib/db.js';
import { sha256 } from '../../lib/hash.js';
import { captureExtensionPage } from './capture-service.js';
import type { ExtensionSnapshot } from './schemas.js';

vi.mock('../../lib/db.js', () => ({ getCollection: vi.fn() }));
vi.mock('../../lib/addresses.js', () => ({
  normalizeLocationForStorage: vi.fn(async (location: string | null) => ({
    location,
    location_details: null,
    location_normalization_status: 'skipped',
    location_normalized_at: new Date(),
  })),
}));
vi.mock('../../lib/notification-settings.js', () => ({
  getReminderDefaultDays: vi.fn(async () => 7),
}));
vi.mock('./gemini.js', () => ({ extractCaptureWithGemini: vi.fn(async () => null) }));
vi.mock('./manual-handoffs.js', () => ({ createManualHandoff: vi.fn() }));

interface StoredDocument {
  _id: { toString(): string };
  userId: string;
  dedup_key?: string;
  jobPostingId?: string;
  url_hash?: string;
}

const jobPostings: StoredDocument[] = [];
const applications: StoredDocument[] = [];

beforeEach(() => {
  jobPostings.length = 0;
  applications.length = 0;

  vi.mocked(getCollection).mockImplementation(async (name) => {
    if (name === 'extension_recipes') {
      return { find: () => ({ toArray: async () => [] }) } as never;
    }
    if (name === 'job_postings') {
      return {
        findOne: async (query: { userId: string; dedup_key: string }) =>
          jobPostings.find((item) => item.userId === query.userId && item.dedup_key === query.dedup_key) ?? null,
        insertOne: async (document: StoredDocument) => {
          if (jobPostings.some((item) => item.userId === document.userId && item.url_hash === document.url_hash)) {
            throw Object.assign(new Error('duplicate key on userId_1_url_hash_1'), { code: 11000 });
          }
          jobPostings.push(document);
        },
      } as never;
    }
    if (name === 'applications') {
      return {
        findOne: async (query: { userId: string; jobPostingId: string }) =>
          applications.find((item) => item.userId === query.userId && item.jobPostingId === query.jobPostingId) ?? null,
        updateOne: async (
          query: { userId: string; jobPostingId: string },
          update: { $setOnInsert: StoredDocument },
        ) => {
          applications.push({ ...query, ...update.$setOnInsert });
          return { upsertedCount: 1 };
        },
      } as never;
    }
    throw new Error(`Unexpected collection: ${name}`);
  });
});

function linkedinSnapshot(jobId: string): ExtensionSnapshot {
  const url = `https://www.linkedin.com/jobs/view/${jobId}/`;
  return {
    version: 1,
    url,
    title: `Developer ${jobId}`,
    canonicalUrl: url,
    metadata: { openGraph: {} },
    jsonLd: [],
    html: `<main><h1 class="job-details-jobs-unified-top-card__job-title">Developer ${jobId}</h1><div class="job-details-jobs-unified-top-card__company-name">Example</div></main>`,
  };
}

describe('extension capture persistence', () => {
  it('saves two different LinkedIn offers for one user under the unique URL hash index', async () => {
    const first = await captureExtensionPage('user-1', linkedinSnapshot('123456'));
    const second = await captureExtensionPage('user-1', linkedinSnapshot('789012'));

    expect(first.status).toBe('saved');
    expect(second.status).toBe('saved');
    expect(jobPostings).toHaveLength(2);
    expect(jobPostings.map((item) => item.url_hash)).toEqual([
      sha256('https://www.linkedin.com/jobs/view/123456/'),
      sha256('https://www.linkedin.com/jobs/view/789012/'),
    ]);
  });
});
