import type { ObjectId } from 'mongodb';

type WithObjectId = { _id: ObjectId };

export function withStringId<T extends WithObjectId>(doc: T): Omit<T, '_id'> & { _id: string } {
  return { ...doc, _id: doc._id.toString() };
}

export function withStringIds<T extends WithObjectId>(docs: T[]): (Omit<T, '_id'> & { _id: string })[] {
  return docs.map(withStringId);
}
