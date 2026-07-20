import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';

interface SkillCount {
  skill: string;
  count: number;
}

function toSortedCounts(counts: Map<string, number>): SkillCount[] {
  return [...counts.entries()]
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session) return;

  const { cvId } = req.query as { cvId?: string };
  if (!cvId || !ObjectId.isValid(cvId)) return res.status(400).json({ error: 'Invalid id' });

  const cvCol = await getCollection('cvs');
  const cv = await cvCol.findOne({ _id: new ObjectId(cvId), userId: session.user.id });
  if (!cv) return res.status(404).json({ error: 'CV introuvable' });

  const analysesCol = await getCollection('cv_analyses');
  const analyses = await analysesCol.find({ cvHash: cv.content_hash }).toArray();

  const presentCounts = new Map<string, number>();
  const missingCounts = new Map<string, number>();

  for (const analysis of analyses) {
    for (const keyword of (analysis.keywords_matched ?? []) as string[]) {
      presentCounts.set(keyword, (presentCounts.get(keyword) ?? 0) + 1);
    }
    for (const keyword of (analysis.keywords_missing ?? []) as string[]) {
      missingCounts.set(keyword, (missingCounts.get(keyword) ?? 0) + 1);
    }
  }

  return res.status(200).json({
    present: toSortedCounts(presentCounts),
    missing: toSortedCounts(missingCounts),
    analyzedCount: analyses.length,
  });
}
