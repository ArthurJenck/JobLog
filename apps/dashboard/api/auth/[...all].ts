import type { VercelRequest, VercelResponse } from '@vercel/node';
import { toNodeHandler } from 'better-auth/node';
import { getAuth } from '../../lib/auth.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const all = req.query['all'];
  const first = Array.isArray(all) ? all[0] : all;

  if (first === 'extension-token') {
    const mod: { default: Handler } = await import('../../server/auth/extension-token.js');
    return mod.default(req, res);
  }

  if (first === 'extension-refresh') {
    const mod: { default: Handler } = await import('../../server/auth/extension-refresh.js');
    return mod.default(req, res);
  }

  const auth = await getAuth();
  return toNodeHandler(auth)(req, res);
}
