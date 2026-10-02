import { describe, expect, it } from 'vitest';
import type { ApplicationWithJob } from '@joblog/shared';
import {
  applyOptimisticApplicationOperation,
  replayOptimisticApplicationOperations,
  type OptimisticApplicationOperation,
} from './optimistic-application';

const CREATED_AT = '2026-09-01T09:00:00.000Z';
const UPDATED_AT = '2026-09-02T09:00:00.000Z';

function application(): ApplicationWithJob {
  return {
    _id: 'application-1',
    userId: 'user-1',
    jobPostingId: 'job-1',
    cvId: null,
    status: 'applied',
    appliedAt: CREATED_AT,
    contact: null,
    notes: null,
    events: [
      { type: 'created', at: CREATED_AT, meta: null },
      { type: 'applied', at: CREATED_AT, meta: null },
    ],
    reminder: {
      enabled: true,
      at: '2026-09-08T09:00:00.000Z',
      frequencyDays: 7,
      maxCount: 3,
      sentCount: 0,
      snoozedUntil: '2026-09-05T09:00:00.000Z',
    },
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
    jobPosting: {
      _id: 'job-1',
      url: 'https://example.com/jobs/1',
      dedup_key: 'key-1',
      dedup_version: 2,
      source: 'manual',
      title: 'Développeur',
      company: 'Acme',
      location: null,
      description: null,
      contract_type: null,
      remote: null,
      salary: null,
      requirements: null,
      keywords: null,
      company_website: null,
      scrape_method: 'manual',
      scraped_at: CREATED_AT,
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
    },
  };
}

type OperationWithoutMetadata<T = OptimisticApplicationOperation> =
  T extends OptimisticApplicationOperation
    ? Omit<T, 'id' | 'controlKey'>
    : never;

function operation(
  input: OperationWithoutMetadata,
): OptimisticApplicationOperation {
  return {
    ...input,
    id: `operation-${input.sequence}`,
    controlKey: `control-${input.sequence}`,
  } as OptimisticApplicationOperation;
}

describe('optimistic application reducer', () => {
  it('replays concurrent operations in sequence order', () => {
    const result = replayOptimisticApplicationOperations(application(), [
      operation({
        type: 'addEvent',
        sequence: 2,
        now: '2026-09-03T11:00:00.000Z',
        event: {
          type: 'followup_sent',
          at: '2026-09-03T11:00:00.000Z',
          meta: null,
        },
      }),
      operation({
        type: 'patchApplication',
        sequence: 1,
        now: '2026-09-03T10:00:00.000Z',
        patch: { notes: 'Relancée par téléphone' },
      }),
    ]);

    expect(result.notes).toBe('Relancée par téléphone');
    expect(result.events.at(-1)?.type).toBe('followup_sent');
    expect(result.reminder.at).toBeNull();
    expect(result.reminder.snoozedUntil).toBeNull();
    expect(result.reminder.enabled).toBe(true);
    expect(result.updated_at).toBe('2026-09-03T11:00:00.000Z');
  });

  it('rolls back one failed operation without losing a later operation', () => {
    const failed = operation({
      type: 'patchApplication',
      sequence: 1,
      now: '2026-09-03T10:00:00.000Z',
      patch: { notes: 'Échec' },
    });
    const pending = operation({
      type: 'patchApplication',
      sequence: 2,
      now: '2026-09-03T11:00:00.000Z',
      patch: {
        contact: {
          name: 'Alex',
          role: null,
          email: null,
          phone: null,
        },
      },
    });

    const optimistic = replayOptimisticApplicationOperations(application(), [
      failed,
      pending,
    ]);
    const rolledBack = replayOptimisticApplicationOperations(application(), [
      pending,
    ]);

    expect(optimistic.notes).toBe('Échec');
    expect(rolledBack.notes).toBeNull();
    expect(rolledBack.contact?.name).toBe('Alex');
  });

  it('replays a confirmed event over its authoritative response without duplicating it', () => {
    const confirmed = operation({
      type: 'addEvent',
      sequence: 1,
      now: '2026-09-03T10:00:00.000Z',
      event: {
        type: 'followup_sent',
        at: '2026-09-03T10:00:00.000Z',
        meta: null,
      },
    });
    const authoritative = applyOptimisticApplicationOperation(
      application(),
      confirmed,
    );
    const reconciled = replayOptimisticApplicationOperations(
      authoritative,
      [confirmed],
    );

    expect(
      reconciled.events.filter(
        (event) =>
          event.type === 'followup_sent'
          && event.at === '2026-09-03T10:00:00.000Z',
      ),
    ).toHaveLength(1);
  });

  it('preserves confirmed and pending fields over an out-of-order response', () => {
    const confirmed = operation({
      type: 'patchApplication',
      sequence: 2,
      now: '2026-09-03T11:00:00.000Z',
      patch: {
        contact: {
          name: 'Alex',
          role: null,
          email: null,
          phone: null,
        },
      },
    });
    const pending = operation({
      type: 'patchApplication',
      sequence: 1,
      now: '2026-09-03T10:00:00.000Z',
      patch: { notes: 'Relancée par téléphone' },
    });
    const staleResponse = applyOptimisticApplicationOperation(
      application(),
      confirmed,
    );
    const reconciled = replayOptimisticApplicationOperations(
      staleResponse,
      [confirmed, pending],
    );

    expect(reconciled.notes).toBe('Relancée par téléphone');
    expect(reconciled.contact?.name).toBe('Alex');
  });

  it('disables reminders and restores a scheduled date when re-enabled', () => {
    const disabled = applyOptimisticApplicationOperation(
      application(),
      operation({
        type: 'patchReminder',
        sequence: 1,
        now: '2026-09-03T10:00:00.000Z',
        patch: { enabled: false },
      }),
    );
    const enabled = applyOptimisticApplicationOperation(
      disabled,
      operation({
        type: 'patchReminder',
        sequence: 2,
        now: '2026-09-04T10:00:00.000Z',
        patch: { enabled: true },
      }),
    );

    expect(disabled.reminder.enabled).toBe(false);
    expect(disabled.reminder.at).toBeNull();
    expect(disabled.reminder.snoozedUntil).toBeNull();
    expect(enabled.reminder.enabled).toBe(true);
    expect(enabled.reminder.at).toBe('2026-09-11T10:00:00.000Z');
  });
});
