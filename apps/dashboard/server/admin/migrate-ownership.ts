import { ObjectId, type Document } from 'mongodb';
import { ensureIndexes } from '../../lib/db-init.js';
import { getDb } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';

export default defineHandler({
  POST: method({
    auth: 'cron',
    async handle() {
      const db = await getDb();
      const jobPostings = db.collection('job_postings');
      const applications = db.collection('applications');
      const cvAnalyses = db.collection('cv_analyses');

      for (const [collection, indexName] of [
        [jobPostings, 'url_hash_1'],
        [cvAnalyses, 'cvHash_1_jobPostingId_1'],
      ] as const) {
        try {
          await collection.dropIndex(indexName);
        } catch {
          // index already absent — idempotent
        }
      }

      let claimed = 0;
      let copiesCreated = 0;
      let repointed = 0;
      let danglingApps = 0;

      const cursor = applications.find(
        {},
        { projection: { _id: 1, userId: 1, jobPostingId: 1 } },
      );

      for await (const app of cursor) {
        const userId = app.userId;
        const jobPostingId = app.jobPostingId;
        if (typeof userId !== 'string' || typeof jobPostingId !== 'string') continue;
        if (!ObjectId.isValid(jobPostingId)) {
          danglingApps += 1;
          continue;
        }

        const jp = await jobPostings.findOne({ _id: new ObjectId(jobPostingId) });
        if (!jp) {
          danglingApps += 1;
          continue;
        }

        if (typeof jp.userId !== 'string') {
          await jobPostings.updateOne(
            { _id: jp._id, userId: { $exists: false } },
            { $set: { userId } },
          );
          claimed += 1;
          continue;
        }

        if (jp.userId === userId) continue;

        let targetId: ObjectId;
        const existingCopy = await jobPostings.findOne({ userId, url_hash: jp.url_hash });
        if (existingCopy) {
          targetId = existingCopy._id;
        } else {
          const copyDoc: Document = { ...jp, userId, updated_at: new Date() };
          delete copyDoc._id;
          const insert = await jobPostings.insertOne(copyDoc);
          targetId = insert.insertedId;
          copiesCreated += 1;
        }

        if (targetId.toString() !== jobPostingId) {
          await applications.updateOne(
            { _id: app._id },
            { $set: { jobPostingId: targetId.toString() } },
          );
          repointed += 1;
        }
      }

      const wipedAnalyses = (await cvAnalyses.deleteMany({ userId: { $exists: false } })).deletedCount ?? 0;

      await ensureIndexes();

      return {
        json: {
          ok: true,
          jobPostings: { claimed, copiesCreated, repointed, danglingApps },
          cvAnalyses: { wiped: wipedAnalyses },
        },
      };
    },
  }),
});
