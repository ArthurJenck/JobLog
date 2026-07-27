import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { canonicalizeSkillKey } from '@joblog/shared';
import { getCollection } from '../../lib/db.js';
import { requireSession } from '../../lib/session.js';

interface SkillCount {
  skill: string;
  count: number;
}

interface SkillAggregate {
  presentCount: number;
  missingCount: number;
  labelCounts: Map<string, number>;
}

function pickLabel(labelCounts: Map<string, number>): string {
  let bestLabel = '';
  let bestCount = -1;
  for (const [label, count] of labelCounts) {
    if (count > bestCount) {
      bestLabel = label;
      bestCount = count;
    }
  }
  return bestLabel;
}

function toSortedCounts(entries: [string, number][]): SkillCount[] {
  return entries
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count);
}

async function findOwnedCv(cvId: string | undefined, userId: string) {
  if (!cvId || !ObjectId.isValid(cvId)) return null;
  const cvCol = await getCollection('cvs');
  return cvCol.findOne({ _id: new ObjectId(cvId), userId });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const { cvId } = req.query as { cvId?: string };
  const cv = await findOwnedCv(cvId, session.user.id);
  if (!cv) return res.status(404).json({ error: 'CV introuvable' });

  if (req.method === 'DELETE') {
    const analysesCol = await getCollection('cv_analyses');
    const result = await analysesCol.deleteMany({ cvHash: cv.content_hash });
    return res.status(200).json({ deleted: result.deletedCount });
  }

  const analysesCol = await getCollection('cv_analyses');
  const analyses = await analysesCol.find({ cvHash: cv.content_hash }).toArray();

  const aggregates = new Map<string, SkillAggregate>();

  function getAggregate(key: string): SkillAggregate {
    let aggregate = aggregates.get(key);
    if (!aggregate) {
      aggregate = { presentCount: 0, missingCount: 0, labelCounts: new Map() };
      aggregates.set(key, aggregate);
    }
    return aggregate;
  }

  function recordLabel(aggregate: SkillAggregate, label: string) {
    aggregate.labelCounts.set(label, (aggregate.labelCounts.get(label) ?? 0) + 1);
  }

  for (const analysis of analyses) {
    for (const keyword of (analysis.keywords_matched ?? []) as string[]) {
      const key = canonicalizeSkillKey(keyword);
      if (!key) continue;
      const aggregate = getAggregate(key);
      aggregate.presentCount += 1;
      recordLabel(aggregate, keyword);
    }
    for (const keyword of (analysis.keywords_missing ?? []) as string[]) {
      const key = canonicalizeSkillKey(keyword);
      if (!key) continue;
      const aggregate = getAggregate(key);
      aggregate.missingCount += 1;
      recordLabel(aggregate, keyword);
    }
  }

  const presentEntries: [string, number][] = [];
  const missingEntries: [string, number][] = [];

  for (const aggregate of aggregates.values()) {
    const label = pickLabel(aggregate.labelCounts);
    if (aggregate.presentCount > 0) {
      presentEntries.push([label, aggregate.presentCount]);
    } else if (aggregate.missingCount > 0) {
      missingEntries.push([label, aggregate.missingCount]);
    }
  }

  return res.status(200).json({
    present: toSortedCounts(presentEntries),
    missing: toSortedCounts(missingEntries),
    analyzedCount: analyses.length,
  });
}
