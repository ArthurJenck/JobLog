import { ObjectId } from 'mongodb';
import { getCollection } from '../../lib/db.js';

export async function resolveApplicationId(userId: string, requestedId: string) {
  const applications = await getCollection('applications');
  if (ObjectId.isValid(requestedId)) {
    const direct = await applications.findOne(
      { _id: new ObjectId(requestedId), userId },
      { projection: { _id: 1 } },
    );
    if (direct) return direct._id;
  }

  const alias = await (await getCollection('application_aliases')).findOne({
    userId,
    legacyApplicationId: requestedId,
  });
  if (!alias || !ObjectId.isValid(String(alias.targetApplicationId))) return null;

  const targetId = new ObjectId(String(alias.targetApplicationId));
  const target = await applications.findOne(
    { _id: targetId, userId },
    { projection: { _id: 1 } },
  );
  return target?._id ?? null;
}

export async function resolveApplicationIds(userId: string, requestedIds: string[]) {
  const resolved = await Promise.all(requestedIds.map((id) => resolveApplicationId(userId, id)));
  return [...new Map(resolved.filter((id): id is ObjectId => id !== null).map((id) => [id.toString(), id])).values()];
}
