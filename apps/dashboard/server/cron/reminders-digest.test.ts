import { describe, expect, test } from 'vitest';
import { buildPushPayload, groupDueReminders } from './reminders-digest.js';

const users = new Map([
  ['user-1', { email: 'one@test.dev' }],
  ['user-2', { email: 'two@test.dev' }],
]);

const jobPostings = new Map([
  ['jp-1', { title: 'Dev Front', company: 'Acme' }],
  ['jp-2', { title: 'Lead React', company: 'Globex' }],
  ['jp-3', { title: 'Fullstack', company: 'Initech' }],
]);

function due(applicationId: string, userId: string, jobPostingId: string, frequencyDays?: number) {
  return { applicationId, userId, jobPostingId, frequencyDays };
}

describe('groupDueReminders', () => {
  test('merges several applications of the same user into one group', () => {
    const { groups, skipped } = groupDueReminders({
      due: [due('app-1', 'user-1', 'jp-1'), due('app-2', 'user-1', 'jp-2')],
      users,
      jobPostings,
      notificationSettings: new Map(),
    });

    expect(skipped).toEqual([]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((item) => item.company)).toEqual(['Acme', 'Globex']);
    expect(groups[0].email).toBe('one@test.dev');
  });

  test('keeps one group per user', () => {
    const { groups } = groupDueReminders({
      due: [due('app-1', 'user-1', 'jp-1'), due('app-2', 'user-2', 'jp-2')],
      users,
      jobPostings,
      notificationSettings: new Map(),
    });

    expect(groups.map((group) => group.userId)).toEqual(['user-1', 'user-2']);
  });

  test('defaults email to enabled and push to disabled', () => {
    const { groups } = groupDueReminders({
      due: [due('app-1', 'user-1', 'jp-1')],
      users,
      jobPostings,
      notificationSettings: new Map(),
    });

    expect(groups[0].emailEnabled).toBe(true);
    expect(groups[0].pushEnabled).toBe(false);
  });

  test('honours the email opt-out while keeping push', () => {
    const { groups } = groupDueReminders({
      due: [due('app-1', 'user-1', 'jp-1')],
      users,
      jobPostings,
      notificationSettings: new Map([
        ['user-1', { email: false, push: true, vapidSubscription: { endpoint: 'x' } }],
      ]),
    });

    expect(groups[0].emailEnabled).toBe(false);
    expect(groups[0].pushEnabled).toBe(true);
    expect(groups[0].vapidSubscription).toEqual({ endpoint: 'x' });
  });

  test('skips items with a missing user or job posting without dropping the group', () => {
    const { groups, skipped } = groupDueReminders({
      due: [
        due('app-1', 'user-1', 'jp-1'),
        due('app-2', 'user-1', 'jp-missing'),
        due('app-3', 'user-missing', 'jp-3'),
      ],
      users,
      jobPostings,
      notificationSettings: new Map(),
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((item) => item.applicationId)).toEqual(['app-1']);
    expect(skipped).toEqual([
      'app-2: missing job posting',
      'app-3: missing user',
    ]);
  });

  test('normalizes the frequency', () => {
    const { groups } = groupDueReminders({
      due: [due('app-1', 'user-1', 'jp-1', 0), due('app-2', 'user-1', 'jp-2', 14)],
      users,
      jobPostings,
      notificationSettings: new Map(),
    });

    expect(groups[0].items.map((item) => item.frequencyDays)).toEqual([7, 14]);
  });
});

describe('buildPushPayload', () => {
  const base = {
    userId: 'user-1',
    emailEnabled: true,
    pushEnabled: true,
  };

  test('keeps the unitary wording for a single item', () => {
    const payload = buildPushPayload(
      {
        ...base,
        items: [
          { applicationId: 'app-1', jobTitle: 'Dev Front', company: 'Acme', frequencyDays: 7 },
        ],
      },
      'https://joblog.test'
    );

    expect(payload.title).toBe('Relance — Acme');
    expect(payload.body).toBe(`N'oublie pas de relancer pour "Dev Front"`);
  });

  test('aggregates several items into one notification', () => {
    const payload = buildPushPayload(
      {
        ...base,
        items: [
          { applicationId: 'app-1', jobTitle: 'Dev Front', company: 'Acme', frequencyDays: 7 },
          { applicationId: 'app-2', jobTitle: 'Lead React', company: 'Globex', frequencyDays: 7 },
        ],
      },
      'https://joblog.test'
    );

    expect(payload.title).toBe('2 relances à faire');
    expect(payload.body).toBe('Acme, Globex');
  });
});
