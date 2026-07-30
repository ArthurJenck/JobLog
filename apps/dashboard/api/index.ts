import type { VercelRequest, VercelResponse } from '@vercel/node';
import { toNodeHandler } from 'better-auth/node';
import { getAuth } from '../lib/auth.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
type Loader = () => Promise<{ default: Handler }>;

function segments(req: VercelRequest): string[] {
  const pathname = (req.url ?? '/').split('?')[0];
  const p = pathname.replace(/^\/api\/?/, '');
  return p ? p.split('/').filter(Boolean) : [];
}

async function handleAuth(req: VercelRequest, res: VercelResponse, segs: string[]) {
  const sub = segs[1];

  if (sub === 'extension-token') {
    const mod: { default: Handler } = await import('../server/auth/extension-token.js');
    return mod.default(req, res);
  }

  if (sub === 'extension-refresh') {
    const mod: { default: Handler } = await import('../server/auth/extension-refresh.js');
    return mod.default(req, res);
  }

  const auth = await getAuth();
  return toNodeHandler(auth)(req, res);
}

const routes: [string, Loader][] = [
  ['cron/reminders', () => import('../server/cron/reminders.js')],
  ['cron/delete-inactive', () => import('../server/cron/delete-inactive.js')],
  ['cron/normalize-addresses', () => import('../server/cron/normalize-addresses.js')],
  ['analyses', () => import('../server/analyses.js')],
  ['feedback', () => import('../server/feedback.js')],
  ['snooze', () => import('../server/snooze.js')],
  ['user', () => import('../server/user.js')],
  ['cvs', () => import('../server/cvs/index.js')],
  ['cvs/skills', () => import('../server/cvs/skills.js')],
  ['platforms', () => import('../server/platforms/index.js')],
  ['platforms/metadata', () => import('../server/platforms/metadata.js')],
  ['tasks', () => import('../server/tasks/index.js')],
  ['streak', () => import('../server/streak/index.js')],
  ['applications', () => import('../server/applications/index.js')],
  ['applications/stats', () => import('../server/applications/stats.js')],
  ['applications/:id', () => import('../server/applications/by-id.js')],
  ['job-postings', () => import('../server/job-postings/index.js')],
  ['job-postings/from-url', () => import('../server/job-postings/from-url.js')],
  ['job-postings/from-url/retry', () => import('../server/job-postings/from-url-retry.js')],
  ['push/subscribe', () => import('../server/push/subscribe.js')],
  ['reminders/pending', () => import('../server/reminders/pending.js')],
  ['addresses/search', () => import('../server/addresses/search.js')],
  ['logos/search', () => import('../server/logos/search.js')],
  ['admin/init-db', () => import('../server/admin/init-db.js')],
  ['admin/migrate-ownership', () => import('../server/admin/migrate-ownership.js')],
];

function matchRoute(segs: string[], pattern: string): Record<string, string> | null {
  const patternSegs = pattern.split('/');
  if (patternSegs.length !== segs.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegs.length; i++) {
    const part = patternSegs[i];
    if (part.startsWith(':')) {
      params[part.slice(1)] = segs[i];
    } else if (part !== segs[i]) {
      return null;
    }
  }
  return params;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segs = segments(req);

  if (segs[0] === 'auth') return handleAuth(req, res, segs);

  for (const [pattern, load] of routes) {
    const params = matchRoute(segs, pattern);
    if (!params) continue;

    for (const [key, value] of Object.entries(params)) {
      req.query[key] = value;
    }

    const mod = await load();
    return mod.default(req, res);
  }

  return res.status(404).json({ error: 'Not found', code: 'not_found' });
}
