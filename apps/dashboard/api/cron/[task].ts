import type { VercelRequest, VercelResponse } from '@vercel/node';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

const TASKS = ['reminders', 'delete-inactive', 'normalize-addresses'] as const;
type Task = (typeof TASKS)[number];

function isTask(v: string): v is Task {
  return (TASKS as readonly string[]).includes(v);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const task = req.query['task'];
  const name = Array.isArray(task) ? task[0] : task;

  if (!name || !isTask(name)) {
    return res.status(404).json({ error: 'Not found' });
  }

  const mod: { default: Handler } = await import(`../../server/cron/${name}.js`);
  return mod.default(req, res);
}
