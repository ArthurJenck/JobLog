import {
  REMINDER_ELIGIBLE_STATUSES,
  EVENT_AUTO_STATUS,
  STATUS_EVENT,
  TERMINAL_STATUSES,
  deriveStatusFromEvents,
  resolveStatusOnEvent,
  type ApplicationWithJob,
  type EventType,
} from '@joblog/shared';

type ApplicationEvent = ApplicationWithJob['events'][number];
type Reminder = ApplicationWithJob['reminder'] & { enabled?: boolean };

export type ApplicationPatch = Partial<
  Pick<
    ApplicationWithJob,
    'status' | 'cvId' | 'appliedAt' | 'contact' | 'notes'
  >
>;

export type JobPostingPatch = Partial<
  Pick<
    ApplicationWithJob['jobPosting'],
    | 'title'
    | 'company'
    | 'location'
    | 'description'
    | 'contract_type'
    | 'remote'
    | 'salary'
    | 'requirements'
    | 'keywords'
    | 'company_website'
    | 'url'
  >
>;

export type OptimisticApplicationOperation =
  | {
      id: string;
      sequence: number;
      controlKey: string;
      now: string;
      type: 'patchApplication';
      patch: ApplicationPatch;
    }
  | {
      id: string;
      sequence: number;
      controlKey: string;
      now: string;
      type: 'patchReminder';
      patch: Partial<Reminder>;
    }
  | {
      id: string;
      sequence: number;
      controlKey: string;
      now: string;
      type: 'patchJobPosting';
      patch: JobPostingPatch;
    }
  | {
      id: string;
      sequence: number;
      controlKey: string;
      now: string;
      type: 'addEvent';
      event: ApplicationEvent;
    }
  | {
      id: string;
      sequence: number;
      controlKey: string;
      now: string;
      type: 'deleteEvent';
      event: Pick<ApplicationEvent, 'type' | 'at'>;
    }
  | {
      id: string;
      sequence: number;
      controlKey: string;
      now: string;
      type: 'updateEventDate';
      event: Pick<ApplicationEvent, 'type' | 'at'> & { newAt: string };
    };

export type OptimisticApplicationOperationInput =
  | Omit<
      Extract<OptimisticApplicationOperation, { type: 'patchApplication' }>,
      'id' | 'sequence' | 'now'
    >
  | Omit<
      Extract<OptimisticApplicationOperation, { type: 'patchReminder' }>,
      'id' | 'sequence' | 'now'
    >
  | Omit<
      Extract<OptimisticApplicationOperation, { type: 'patchJobPosting' }>,
      'id' | 'sequence' | 'now'
    >
  | Omit<
      Extract<OptimisticApplicationOperation, { type: 'addEvent' }>,
      'id' | 'sequence' | 'now'
    >
  | Omit<
      Extract<OptimisticApplicationOperation, { type: 'deleteEvent' }>,
      'id' | 'sequence' | 'now'
    >
  | Omit<
      Extract<OptimisticApplicationOperation, { type: 'updateEventDate' }>,
      'id' | 'sequence' | 'now'
    >;

function isReminderEnabled(reminder: Reminder) {
  return reminder.enabled !== false;
}

function nextReminderAt(now: string, frequencyDays: number) {
  return new Date(
    new Date(now).getTime() + frequencyDays * 24 * 60 * 60 * 1000,
  ).toISOString();
}

function applyStatus(
  application: ApplicationWithJob,
  status: ApplicationWithJob['status'],
  now: string,
) {
  const statusChanged = status !== application.status;
  const reminder = application.reminder as Reminder;
  const nextReminder: Reminder = { ...reminder };
  let events = application.events;
  let appliedAt = application.appliedAt;

  if (status === 'applied' && !appliedAt) appliedAt = now;

  if (TERMINAL_STATUSES.includes(status)) {
    nextReminder.at = null;
    nextReminder.snoozedUntil = null;
  } else if (
    REMINDER_ELIGIBLE_STATUSES.includes(status) &&
    isReminderEnabled(reminder) &&
    !reminder.at
  ) {
    nextReminder.at = nextReminderAt(now, reminder.frequencyDays);
  }

  const eventType = STATUS_EVENT[status];
  if (
    statusChanged &&
    eventType &&
    !events.some((event) => event.type === eventType)
  ) {
    events = [...events, { type: eventType, at: now, meta: null }];
  }

  return {
    ...application,
    status,
    appliedAt,
    events,
    reminder: nextReminder,
  };
}

function applyReminderPatch(
  application: ApplicationWithJob,
  patch: Partial<Reminder>,
  now: string,
) {
  const previous = application.reminder as Reminder;
  const reminder: Reminder = { ...previous, ...patch };

  if (patch.enabled === false) {
    reminder.at = null;
    reminder.snoozedUntil = null;
  } else if (patch.enabled === true && previous.enabled === false) {
    reminder.at = REMINDER_ELIGIBLE_STATUSES.includes(application.status)
      ? nextReminderAt(now, reminder.frequencyDays)
      : null;
    reminder.snoozedUntil = null;
  }

  return { ...application, reminder };
}

function applyAddedEvent(
  application: ApplicationWithJob,
  event: ApplicationEvent,
  now: string,
) {
  let next = {
    ...application,
    events: application.events.some(
      (existing) => existing.type === event.type && existing.at === event.at,
    )
      ? application.events
      : [...application.events, event],
  };
  const nextStatus = resolveStatusOnEvent(application.status, event.type);

  if (nextStatus) next = applyStatus(next, nextStatus, now);

  if (event.type === 'followup_sent' || event.type === 'response_received') {
    next = {
      ...next,
      reminder: {
        ...next.reminder,
        at: null,
        snoozedUntil: null,
      },
    };
  }

  return next;
}

export function applyOptimisticApplicationOperation(
  application: ApplicationWithJob,
  operation: OptimisticApplicationOperation,
): ApplicationWithJob {
  let next = application;

  switch (operation.type) {
    case 'patchApplication': {
      const { status, ...patch } = operation.patch;
      next = { ...next, ...patch };
      if (status) next = applyStatus(next, status, operation.now);
      break;
    }
    case 'patchReminder':
      next = applyReminderPatch(next, operation.patch, operation.now);
      break;
    case 'patchJobPosting':
      next = {
        ...next,
        jobPosting: {
          ...next.jobPosting,
          ...operation.patch,
          updated_at: operation.now,
        },
      };
      break;
    case 'addEvent':
      next = applyAddedEvent(next, operation.event, operation.now);
      break;
    case 'deleteEvent': {
      const events = next.events.filter(
        (event) =>
          event.type !== operation.event.type ||
          event.at !== operation.event.at,
      );
      next = { ...next, events };
      if (EVENT_AUTO_STATUS[operation.event.type] !== undefined) {
        next = applyStatus(
          next,
          deriveStatusFromEvents(events),
          operation.now,
        );
      }
      break;
    }
    case 'updateEventDate': {
      const events = next.events.map((event) =>
        event.type === operation.event.type &&
        event.at === operation.event.at
          ? { ...event, at: operation.event.newAt }
          : event,
      );
      next = {
        ...next,
        events,
      };
      if (EVENT_AUTO_STATUS[operation.event.type] !== undefined) {
        next = applyStatus(
          next,
          deriveStatusFromEvents(events),
          operation.now,
        );
      }
      break;
    }
  }

  return { ...next, updated_at: operation.now };
}

export function replayOptimisticApplicationOperations(
  application: ApplicationWithJob,
  operations: OptimisticApplicationOperation[],
) {
  return operations
    .toSorted((left, right) => left.sequence - right.sequence)
    .reduce(applyOptimisticApplicationOperation, application);
}

export function eventControlKey(
  action: 'add' | 'delete' | 'date',
  type: EventType,
  at?: string,
) {
  return `event:${action}:${type}${at ? `:${at}` : ''}`;
}
