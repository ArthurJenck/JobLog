import { fromNodeHeaders } from 'better-auth/node';
import { ObjectId } from 'mongodb';
import { getAuth } from '../lib/auth.js';
import { getCollection } from '../lib/db.js';
import { defineHandler, method } from '../lib/http/define-handler.js';

export default defineHandler({
  DELETE: method({
    async handle({ req, res, user }) {
      const userId = user.id;

      const cvsCol = await getCollection('cvs');
      const userCvs = await cvsCol
        .find({ userId }, { projection: { content_hash: 1 } })
        .toArray();
      const cvHashes = userCvs
        .map((cv) => cv.content_hash as string | undefined)
        .filter((hash): hash is string => typeof hash === 'string' && hash.length > 0);

      await Promise.all([
        getCollection('applications').then((col) => col.deleteMany({ userId })),
        cvsCol.deleteMany({ userId }),
        getCollection('notification_settings').then((col) => col.deleteMany({ userId })),
        getCollection('extension_tokens').then((col) => col.deleteMany({ userId })),
        getCollection('token_revocations').then((col) => col.insertOne({ userId, revokedAt: new Date() })),
        cvHashes.length
          ? getCollection('cv_analyses').then((col) => col.deleteMany({ userId, cvHash: { $in: cvHashes } }))
          : Promise.resolve(),
      ]);

      try {
        const auth = await getAuth();
        await auth.api.deleteUser({ headers: fromNodeHeaders(req.headers), body: {} });
      } catch {
        try {
          const userCol = await getCollection('user');
          await userCol.deleteOne({ _id: new ObjectId(userId) });
        } catch { /* best-effort */ }
      }

      res.setHeader('Set-Cookie', 'better-auth.session_token=; Max-Age=0; Path=/');
      return { json: { ok: true } };
    },
  }),
});
