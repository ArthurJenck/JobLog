import { randomBytes } from 'node:crypto';
import { getCollection } from '../../lib/db.js';
import { sha256 } from '../../lib/hash.js';

export interface ManualHandoffDraft {
  url: string;
  source: string;
  source_key?: string | null;
  source_label?: string | null;
  native_job_id?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  contract_type?: string | null;
  remote?: string | null;
  salary?: {
    min: number | null;
    max: number | null;
    currency: string | null;
    period: 'month' | 'year' | null;
  } | null;
  requirements?: string[] | null;
  keywords?: string[] | null;
}

export async function createManualHandoff(userId: string, draft: ManualHandoffDraft) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60_000);

  await (await getCollection('manual_handoffs')).insertOne({
    userId,
    tokenHash: sha256(token),
    draft,
    consumedAt: null,
    createdAt: now,
    expiresAt,
  });

  return { token, expiresAt };
}
