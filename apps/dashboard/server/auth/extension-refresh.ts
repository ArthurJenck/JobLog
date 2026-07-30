import { createHash, randomBytes, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getCollection } from '../../lib/db.js';
import { getExtensionJwtSecret } from '../../lib/env.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';

const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const BodySchema = z.object({
  refreshToken: z.string().min(1),
});

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export default defineHandler({
  POST: method({
    auth: 'public',
    async handle({ req }) {
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) throw ApiError.badRequest('refreshToken requis');
      const { refreshToken } = parsed.data;

      const tokenHash = hashToken(refreshToken);
      const col = await getCollection('extension_tokens');

      const doc = await col.findOne({ tokenHash });

      if (!doc || doc.expiresAt < new Date()) {
        throw ApiError.unauthorized('Token invalide ou expiré');
      }

      const userCol = await getCollection('user');
      const user = await userCol.findOne({ _id: new ObjectId(String(doc.userId)) });
      if (!user) throw ApiError.unauthorized('Utilisateur introuvable');

      const userId = String(doc.userId);
      const newRefreshToken = randomBytes(32).toString('hex');
      const newHash = hashToken(newRefreshToken);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + REFRESH_TTL_MS);

      await col.replaceOne(
        { tokenHash },
        { userId: doc.userId, tokenHash: newHash, createdAt: doc.createdAt, expiresAt, lastUsedAt: now }
      );

      const iat = Math.floor(Date.now() / 1000);
      const revocations = await getCollection('token_revocations');
      await revocations.insertOne({ userId, revokedAt: new Date(iat * 1000 - 1) });

      const accessToken = jwt.sign(
        { sub: userId, email: String(user.email), type: 'access', iat },
        getExtensionJwtSecret(),
        { expiresIn: '15m', jwtid: randomUUID(), issuer: 'joblog', audience: 'joblog-extension' }
      );

      return { json: { accessToken, refreshToken: newRefreshToken } };
    },
  }),
});
