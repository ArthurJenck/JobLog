import { getCollection } from '../../lib/db.js';

const CONTROL_KEY = 'dedup-key-v2';
export const MIGRATION_RETRY_AFTER_SECONDS = 30;

export async function isDedupMigrationMaintenanceActive(ownerId?: string) {
  const control = await (await getCollection<{
    key: string;
    active: boolean;
    ownerId?: string;
  }>('migration_controls')).findOne({ key: CONTROL_KEY });
  return control?.active === true && (!ownerId || control.ownerId === ownerId);
}

export async function setDedupMigrationMaintenance(active: boolean, ownerId: string) {
  const controls = await getCollection('migration_controls');
  await controls.createIndex({ key: 1 }, { unique: true });
  if (active) {
    try {
      const control = await controls.findOneAndUpdate(
        {
          key: CONTROL_KEY,
          $or: [{ active: { $ne: true } }, { ownerId }],
        },
        {
          $set: { active: true, ownerId, updatedAt: new Date() },
          $setOnInsert: { key: CONTROL_KEY, createdAt: new Date() },
        },
        { upsert: true, returnDocument: 'after' },
      );
      if (!control || control.ownerId !== ownerId) {
        throw new Error('Migration maintenance lock is already held');
      }
      return;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new Error('Migration maintenance lock is already held', { cause: error });
      }
      throw error;
    }
  }

  const result = await controls.updateOne(
    { key: CONTROL_KEY, active: true, ownerId },
    { $set: { active: false, updatedAt: new Date() } },
  );
  if (result.matchedCount === 0) {
    throw new Error('Migration maintenance lock is not owned by this process');
  }
}

export class MigrationMaintenanceError extends Error {
  constructor() {
    super('Deduplication migration maintenance is active');
  }
}

export async function assertDedupMigrationWritesAllowed() {
  if (await isDedupMigrationMaintenanceActive()) {
    throw new MigrationMaintenanceError();
  }
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}
