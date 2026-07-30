import { createHash, randomBytes, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { getCollection } from '../../lib/db.js';
import { getExtensionJwtSecret } from '../../lib/env.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';

const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export default defineHandler({
  POST: method({
    rateLimit: {
      max: 10,
      windowMs: 60 * 60 * 1000,
      scope: ({ user }) => `extension-token:${user!.id}`,
    },
    async handle({ user }) {
      const userId = user.id;

      const accessToken = jwt.sign(
        { sub: userId, email: user.email, type: 'access' },
        getExtensionJwtSecret(),
        { expiresIn: '15m', jwtid: randomUUID(), issuer: 'joblog', audience: 'joblog-extension' }
      );

      const refreshToken = randomBytes(32).toString('hex');
      const tokenHash = hashToken(refreshToken);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + REFRESH_TTL_MS);

      const col = await getCollection('extension_tokens');
      await col.insertOne({ userId, tokenHash, createdAt: now, expiresAt, lastUsedAt: now });

      return { json: { accessToken, refreshToken } };
    },
  }),
});
