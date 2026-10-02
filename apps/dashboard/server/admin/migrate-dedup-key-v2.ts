import { z } from 'zod';
import { defineHandler, method } from '../../lib/http/define-handler.js';
import { runDedupKeyV2Migration } from '../migrations/dedup-key-v2.js';
import { setDedupMigrationMaintenance } from '../migrations/maintenance.js';

const MigrationRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('dry-run'), batchSize: z.number().int().min(10).max(1000).optional() }).strict(),
  z.object({ action: z.literal('run'), ownerId: z.string().uuid(), batchSize: z.number().int().min(10).max(1000).optional() }).strict(),
  z.object({ action: z.literal('unlock'), ownerId: z.string().uuid() }).strict(),
]);

export default defineHandler({
  POST: method({
    auth: 'cron',
    body: MigrationRequestSchema,
    async handle({ body }) {
      if (body.action === 'dry-run') {
        return { json: await runDedupKeyV2Migration({ dryRun: true, batchSize: body.batchSize }) };
      }

      if (body.action === 'unlock') {
        await setDedupMigrationMaintenance(false, body.ownerId);
        return { json: { ok: true, maintenanceActive: false } };
      }

      await setDedupMigrationMaintenance(true, body.ownerId);
      const result = await runDedupKeyV2Migration({
        dryRun: false,
        ownerId: body.ownerId,
        batchSize: body.batchSize,
      });
      await setDedupMigrationMaintenance(false, body.ownerId);
      return { json: result };
    },
  }),
});
