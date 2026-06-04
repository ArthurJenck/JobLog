import type { VercelRequest, VercelResponse } from '@vercel/node';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

function segments(req: VercelRequest): string[] {
  const raw = req.query['path'];
  return Array.isArray(raw) ? raw : raw ? raw.split('/') : [];
}

function key(segs: string[]) {
  return segs.join('/');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segs = segments(req);
  const route = key(segs);

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
