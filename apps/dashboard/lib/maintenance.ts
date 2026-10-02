import { getCollection } from './db.js';
import { ApiError } from './http/errors.js';

const DEDUP_MIGRATION_KEY = 'dedup-key-v2';
const RETRY_AFTER_SECONDS = 30;

export async function isWriteMaintenanceActive() {
  const state = await (await getCollection('migration_controls')).findOne({
    key: DEDUP_MIGRATION_KEY,
    active: true,
  });
  return Boolean(state);
}

export async function assertWriteMaintenanceInactive() {
  if (await isWriteMaintenanceActive()) {
    throw ApiError.serviceUnavailable(
      'Maintenance temporaire en cours, réessaie dans quelques instants.',
      RETRY_AFTER_SECONDS,
    );
  }
}
