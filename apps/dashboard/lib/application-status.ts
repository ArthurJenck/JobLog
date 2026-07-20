import { STATUS_EVENT, TERMINAL_STATUSES, type ApplicationStatus, type EventType } from '@joblog/shared';

interface StatusChangeSource {
  status: ApplicationStatus;
  appliedAt?: Date | null;
  events?: Array<{ type: EventType; at: Date; meta: unknown }>;
}

export function buildStatusChangeUpdates(app: StatusChangeSource, newStatus: ApplicationStatus) {
  const updates: Record<string, unknown> = { status: newStatus, updated_at: new Date() };

  if (newStatus === 'applied' && !app.appliedAt) {
    updates['appliedAt'] = new Date();
  }

  if (TERMINAL_STATUSES.includes(newStatus)) {
    updates['reminder.at'] = null;
  }

  if (newStatus !== app.status) {
    const newType = STATUS_EVENT[newStatus];
    if (newType) {
      const events = app.events ?? [];
      if (!events.some((e) => e.type === newType)) {
        updates['events'] = [...events, { type: newType, at: new Date(), meta: null }];
      }
    }
  }

  return updates;
}
