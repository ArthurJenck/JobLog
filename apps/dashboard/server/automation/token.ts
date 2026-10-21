import { createHash, randomBytes } from 'node:crypto';
import { getCollection } from '../../lib/db.js';

export function hashAutomationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createAutomationToken() {
  return `jl_n8n_${randomBytes(32).toString('base64url')}`;
}

export async function getAutomationUserId(authorization: string | string[] | undefined) {
  if (typeof authorization !== 'string') return null;
  const match = /^Bearer (jl_n8n_[A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) return null;

  const col = await getCollection('automation_tokens');
  const token = await col.findOne({ tokenHash: hashAutomationToken(match[1]) });
  return typeof token?.userId === 'string' ? token.userId : null;
}
