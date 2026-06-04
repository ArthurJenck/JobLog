import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { searchAddressSuggestions } from '../../lib/addresses.js';
import { requireSession } from '../../lib/session.js';

const QuerySchema = z.object({
  q: z.string().trim().min(3).max(120),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session) return;

  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const data = await searchAddressSuggestions(parsed.data.q);
    return res.status(200).json({ data });
  } catch {
    return res.status(502).json({ error: 'Address search unavailable' });
  }
}
