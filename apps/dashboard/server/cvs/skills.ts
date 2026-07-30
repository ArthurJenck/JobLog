import { canonicalizeSkillKey } from '@joblog/shared';
import { ObjectId } from 'mongodb';
import { getCollection } from '../../lib/db.js';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { ApiError } from '../../lib/http/errors.js';

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

export default defineHandler({
  GET: method({
    async handle({ user, query }) {
      const { cvId } = query as { cvId?: string };
      const cv = await findOwnedCv(cvId, user.id);
      if (!cv) throw ApiError.notFound('CV introuvable');

      const analysesCol = await getCollection('cv_analyses');
      const analyses = await analysesCol.find({ userId: user.id, cvHash: cv.content_hash }).toArray();

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

      return {
        json: {
          present: toSortedCounts(presentEntries),
          missing: toSortedCounts(missingEntries),
          analyzedCount: analyses.length,
        },
      };
    },
  }),
  DELETE: method({
    async handle({ user, query }) {
      const { cvId } = query as { cvId?: string };
      const cv = await findOwnedCv(cvId, user.id);
      if (!cv) throw ApiError.notFound('CV introuvable');

      const analysesCol = await getCollection('cv_analyses');
      const result = await analysesCol.deleteMany({ userId: user.id, cvHash: cv.content_hash });
      return { json: { deleted: result.deletedCount } };
    },
  }),
});
