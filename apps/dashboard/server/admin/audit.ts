import { getCollection } from '../../lib/db.js';

export async function writeAdminAuditLog(input: {
  adminId: string;
  action: string;
  target: string;
  details?: Record<string, unknown>;
}) {
  await (await getCollection('admin_audit_log')).insertOne({
    ...input,
    createdAt: new Date(),
  });
}
