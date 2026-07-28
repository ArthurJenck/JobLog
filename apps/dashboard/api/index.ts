import type { VercelRequest, VercelResponse } from '@vercel/node';
import { toNodeHandler } from 'better-auth/node';
import { getAuth } from '../lib/auth.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

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

async function handleCron(req: VercelRequest, res: VercelResponse, segs: string[]) {
  const name = segs[1];

  let mod: { default: Handler } | null = null;
  if (name === 'reminders') mod = await import('../server/cron/reminders.js');
  else if (name === 'delete-inactive') mod = await import('../server/cron/delete-inactive.js');
  else if (name === 'normalize-addresses') mod = await import('../server/cron/normalize-addresses.js');

  if (!mod) return res.status(404).json({ error: 'Not found' });
  return mod.default(req, res);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segs = segments(req);

  if (segs[0] === 'auth') return handleAuth(req, res, segs);
  if (segs[0] === 'cron') return handleCron(req, res, segs);

  const route = segs.join('/');
  let mod: { default: Handler } | null = null;

  if (route === 'analyses') {
    mod = await import('../server/analyses.js');
  } else if (route === 'feedback') {
    mod = await import('../server/feedback.js');
  } else if (route === 'snooze') {
    mod = await import('../server/snooze.js');
  } else if (route === 'user') {
    mod = await import('../server/user.js');
  } else if (route === 'cvs') {
    mod = await import('../server/cvs/index.js');
  } else if (route === 'cvs/skills') {
    mod = await import('../server/cvs/skills.js');
  } else if (route === 'platforms') {
    mod = await import('../server/platforms/index.js');
  } else if (route === 'platforms/metadata') {
    mod = await import('../server/platforms/metadata.js');
  } else if (route === 'tasks') {
    mod = await import('../server/tasks/index.js');
  } else if (route === 'streak') {
    mod = await import('../server/streak/index.js');
  } else if (route === 'applications') {
    mod = await import('../server/applications/index.js');
  } else if (route === 'applications/stats') {
    mod = await import('../server/applications/stats.js');
  } else if (segs[0] === 'applications' && segs.length === 2) {
    req.query['id'] = segs[1];
    mod = await import('../server/applications/by-id.js');
  } else if (route === 'job-postings') {
    mod = await import('../server/job-postings/index.js');
  } else if (route === 'job-postings/from-url') {
    mod = await import('../server/job-postings/from-url.js');
  } else if (route === 'job-postings/from-url/retry') {
    mod = await import('../server/job-postings/from-url-retry.js');
  } else if (route === 'push/subscribe') {
    mod = await import('../server/push/subscribe.js');
  } else if (route === 'reminders/pending') {
    mod = await import('../server/reminders/pending.js');
  } else if (route === 'addresses/search') {
    mod = await import('../server/addresses/search.js');
  } else if (route === 'logos/search') {
    mod = await import('../server/logos/search.js');
  } else if (route === 'admin/init-db') {
    mod = await import('../server/admin/init-db.js');
  }

  if (!mod) {
    return res.status(404).json({ error: 'Not found' });
  }

  return mod.default(req, res);
}
