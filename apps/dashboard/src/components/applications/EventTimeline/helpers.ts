import {
  EVENT_LABELS,
  EVENT_PIPELINE,
  TERMINAL_STATUSES,
  type ApplicationStatus,
  type EventType,
} from '@joblog/shared';

export interface EventItem {
  type: EventType;
  at: string;
  meta: Record<string, unknown> | null;
}

export const ADDABLE_EVENTS: EventType[] = [
  'applied',
  'response_received',
  'interview_scheduled',
  'interview_done',
  'thank_you_sent',
  'followup_sent',
  'offer_received',
  'offer_accepted',
  'offer_declined',
  'rejected',
  'ghosted',
  'cancelled',
  'custom',
];

export function getNextPipelineEvent(
  events: EventItem[],
  currentStatus: ApplicationStatus,
): EventType | null {
  if ((TERMINAL_STATUSES as readonly string[]).includes(currentStatus))
    return null;
  const existing = new Set(events.map((e) => e.type));

  if (existing.has('interview_scheduled') && !existing.has('interview_done')) {
    return 'interview_done';
  }
  if (existing.has('interview_done') && !existing.has('thank_you_sent')) {
    return 'thank_you_sent';
  }
  if (existing.has('thank_you_sent') && !existing.has('followup_sent')) {
    return 'followup_sent';
  }
  if (existing.has('followup_sent') && !existing.has('response_received')) {
    return 'response_received';
  }

  for (const step of EVENT_PIPELINE) {
    if (!existing.has(step)) return step;
  }
  return null;
}

export function getEventLabel(event: EventItem): string {
  if (event.type === 'custom') {
    return typeof event.meta?.label === 'string'
      ? event.meta.label
      : 'Note personnalisée';
  }
  return (
    EVENT_LABELS[event.type] ??
    (typeof event.meta?.label === 'string' ? event.meta.label : event.type)
  );
}
