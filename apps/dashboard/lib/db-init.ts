import { getDb } from './db.js';

export async function ensureIndexes() {
  const db = await getDb();

  await Promise.all([
    db.collection('job_postings').createIndex({ url_hash: 1 }, { unique: true }),

    db.collection('applications').createIndex({ userId: 1, status: 1 }),
    db.collection('applications').createIndex({ userId: 1, 'reminder.at': 1 }),

    db.collection('cvs').createIndex({ userId: 1 }),

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

    db.collection('notification_settings').createIndex({ userId: 1 }, { unique: true }),

    db.collection('extension_tokens').createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection('extension_tokens').createIndex({ userId: 1 }),
    db.collection('extension_tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
