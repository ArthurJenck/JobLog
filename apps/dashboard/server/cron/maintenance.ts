import { defineHandler, method } from '../../lib/http/define-handler.js';
import { runDeleteInactive } from './delete-inactive.js';
import { runNormalizeAddresses } from './normalize-addresses.js';

async function runStep<T>(run: () => Promise<T>) {
  try {
    return { ok: true as const, result: await run() };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runMaintenance() {
  const deleteInactive = await runStep(runDeleteInactive);
  const normalizeAddresses = await runStep(() => runNormalizeAddresses());

  return { deleteInactive, normalizeAddresses };
}

const maintenanceMethod = method({
  auth: 'cron',
  async handle() {
    return { json: await runMaintenance() };
  },
});

export default defineHandler({
  GET: maintenanceMethod,
  POST: maintenanceMethod,
});
