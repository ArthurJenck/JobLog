import { getDb } from './db.js';

export async function ensureIndexes() {
  const db = await getDb();

  await Promise.all([
    db.collection('job_postings').createIndex({ url_hash: 1 }, { unique: true }),
    db.collection('job_postings').createIndex({ location_normalization_status: 1 }),
    db.collection('job_postings').createIndex({ scrape_status: 1 }),

    db.collection('applications').createIndex({ userId: 1, status: 1 }),
    db.collection('applications').createIndex({ userId: 1, 'reminder.at': 1 }),

    db.collection('cvs').createIndex({ userId: 1 }),

    db.collection('platforms').createIndex({ userId: 1, createdAt: -1 }),

    db.collection('quest_templates').createIndex({ userId: 1, order: 1 }),

    db.collection('cv_analyses').createIndex(
      { cvHash: 1, jobPostingId: 1 },
      { unique: true }
    ),

    db.collection('quota_usage').createIndex({ date: 1 }, { unique: true }),

    db.collection('usage_limits').createIndex(
      { userId: 1, date: 1, kind: 1 },
      { unique: true }
    ),

    db.collection('jina_usage').createIndex(
      { date: 1, keyHash: 1 },
      { unique: true }
    ),
    db.collection('jina_usage').createIndex({ date: 1, alertedAt: 1 }),

    db.collection('firecrawl_usage').createIndex({ month: 1 }, { unique: true }),

    db.collection('notification_settings').createIndex({ userId: 1 }, { unique: true }),

    db.collection('extension_tokens').createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection('extension_tokens').createIndex({ userId: 1 }),
    db.collection('extension_tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
