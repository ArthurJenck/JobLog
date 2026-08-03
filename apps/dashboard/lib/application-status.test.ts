import { describe, expect, it } from 'vitest';
import { buildStatusChangeUpdates } from './application-status.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(value: unknown) {
  return Math.round((new Date(value as Date).getTime() - Date.now()) / DAY_MS);
}

describe('buildStatusChangeUpdates', () => {
  it('schedules the reminder with the user default frequency', () => {
    const updates = buildStatusChangeUpdates({ status: 'saved' }, 'applied', 14);

    expect(daysFromNow(updates['reminder.at'])).toBe(14);
    expect(updates['reminder.frequencyDays']).toBe(14);
  });

  it('falls back to 7 days when no default is provided', () => {
    const updates = buildStatusChangeUpdates({ status: 'saved' }, 'applied');

    expect(daysFromNow(updates['reminder.at'])).toBe(7);
    expect(updates['reminder.frequencyDays']).toBe(7);
  });

  it('prefers the per-application frequency over the user default', () => {
    const updates = buildStatusChangeUpdates(
      { status: 'saved', reminder: { at: null, frequencyDays: 3 } },
      'interview',
      14,
    );

    expect(daysFromNow(updates['reminder.at'])).toBe(3);
    expect(updates['reminder.frequencyDays']).toBe(3);
  });

  it('leaves an existing reminder date untouched', () => {
    const at = new Date(Date.now() + 2 * DAY_MS);
    const updates = buildStatusChangeUpdates({ status: 'applied', reminder: { at } }, 'interview', 14);

    expect(updates).not.toHaveProperty('reminder.at');
    expect(updates).not.toHaveProperty('reminder.frequencyDays');
  });

  it('clears the reminder on a terminal status', () => {
    const updates = buildStatusChangeUpdates({ status: 'applied' }, 'rejected', 14);

    expect(updates['reminder.at']).toBeNull();
    expect(updates).not.toHaveProperty('reminder.frequencyDays');
  });
});
