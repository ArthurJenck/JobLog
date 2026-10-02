import { MongoServerError } from 'mongodb';
import { getDb } from './db.js';

export async function ensureIndexes() {
  const db = await getDb();
  let dedupIndexExists = false;

  try {
    dedupIndexExists = await db
      .collection('job_postings')
      .indexExists('userId_1_dedup_key_1');
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 26) throw error;
  }
  const dedupMigrationActive = Boolean(await db.collection('migration_controls').findOne({
    key: 'dedup-key-v2',
    active: true,
  }));

  await Promise.all([
    db.collection('job_postings').createIndex({ userId: 1, url_hash: 1 }, { unique: true }),
    dedupIndexExists || dedupMigrationActive
      ? Promise.resolve('userId_1_dedup_key_1')
      : db.collection('job_postings').createIndex(
        { userId: 1, dedup_key: 1 },
        {
          unique: true,
          partialFilterExpression: { dedup_key: { $type: 'string' } },
        },
      ),
    db.collection('job_postings').createIndex({ location_normalization_status: 1 }),
    db.collection('job_postings').createIndex({ scrape_status: 1 }),

    db.collection('applications').createIndex({ userId: 1, status: 1 }),
    db.collection('applications').createIndex(
      { userId: 1, jobPostingId: 1 },
      { unique: true },
    ),
    db.collection('applications').createIndex({ userId: 1, 'reminder.at': 1 }),

    db.collection('cvs').createIndex({ userId: 1 }),

    db.collection('platforms').createIndex({ userId: 1, createdAt: -1 }),

    db.collection('quest_templates').createIndex({ userId: 1, order: 1 }),

    db.collection('cv_analyses').createIndex(
      { userId: 1, cvHash: 1, jobPostingId: 1 },
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

    db.collection('rate_limits').createIndex({ key: 1, windowStart: 1 }, { unique: true }),
    db.collection('rate_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),

    db.collection('token_revocations').createIndex({ userId: 1 }),

    db.collection('job_posting_aliases').createIndex(
      { userId: 1, legacyJobPostingId: 1 },
      {
        unique: true,
        partialFilterExpression: { legacyJobPostingId: { $type: 'string' } },
      },
    ),
    db.collection('job_posting_aliases').createIndex(
      { userId: 1, legacyKey: 1 },
      {
        unique: true,
        partialFilterExpression: { legacyKey: { $type: 'string' } },
      },
    ),
    db.collection('application_aliases').createIndex(
      { userId: 1, legacyApplicationId: 1 },
      { unique: true },
    ),

    db.collection('migration_leases').createIndex({ key: 1 }, { unique: true }),
    db.collection('migration_leases').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('migration_progress').createIndex({ key: 1 }, { unique: true }),
    db.collection('migration_controls').createIndex({ key: 1 }, { unique: true }),

    db.collection('extension_recipes').createIndex({ recipeKey: 1 }, { unique: true }),
    db.collection('extension_fixture_sessions').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    ),
    db.collection('recipe_test_proofs').createIndex({ proofHash: 1 }, { unique: true }),
    db.collection('recipe_test_proofs').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    ),
    db.collection('admin_audit_log').createIndex({ createdAt: -1 }),
    db.collection('manual_handoffs').createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection('manual_handoffs').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    ),
  ]);
}
