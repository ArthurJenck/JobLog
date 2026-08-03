import { describe, expect, it } from 'vitest';
import {
  getParisDateKey,
  getParisMonthKey,
  isStreakContinuation,
  isWeekendDayKey,
  localDayBounds,
  localDayKey,
  normalizeFrequencyDays,
} from './dates.js';

describe('getParisDateKey', () => {
  it('formats a date as YYYY-MM-DD in the Europe/Paris time zone', () => {
    expect(getParisDateKey(new Date('2024-03-15T23:30:00Z'))).toBe('2024-03-16');
    expect(getParisDateKey(new Date('2024-01-01T00:30:00Z'))).toBe('2024-01-01');
  });
});

describe('getParisMonthKey', () => {
  it('returns the YYYY-MM prefix of the Paris date key', () => {
    expect(getParisMonthKey(new Date('2024-03-15T23:30:00Z'))).toBe('2024-03');
  });
});

describe('normalizeFrequencyDays', () => {
  it('returns the value when it is a positive finite number', () => {
    expect(normalizeFrequencyDays(3)).toBe(3);
    expect(normalizeFrequencyDays(14.9)).toBe(14);
  });

  it('falls back to 7 for invalid values', () => {
    expect(normalizeFrequencyDays(undefined)).toBe(7);
    expect(normalizeFrequencyDays(null)).toBe(7);
    expect(normalizeFrequencyDays(0)).toBe(7);
    expect(normalizeFrequencyDays(-2)).toBe(7);
    expect(normalizeFrequencyDays(NaN)).toBe(7);
    expect(normalizeFrequencyDays('not-a-number')).toBe(7);
  });
});

describe('localDayKey', () => {
  it('formats the local date as YYYY-MM-DD', () => {
    expect(localDayKey(new Date(2024, 2, 5))).toBe('2024-03-05');
  });
});

describe('isWeekendDayKey', () => {
  it('is true for Saturday and Sunday, false for weekdays', () => {
    expect(isWeekendDayKey('2024-03-16')).toBe(true); // samedi
    expect(isWeekendDayKey('2024-03-17')).toBe(true); // dimanche
    expect(isWeekendDayKey('2024-03-15')).toBe(false); // vendredi
    expect(isWeekendDayKey('2024-03-18')).toBe(false); // lundi
  });
});

describe('isStreakContinuation', () => {
  it('continues across the weekend', () => {
    expect(isStreakContinuation('2024-03-15', '2024-03-18')).toBe(true); // ven -> lun
    expect(isStreakContinuation('2024-03-15', '2024-03-16')).toBe(true); // ven -> sam
    expect(isStreakContinuation('2024-03-15', '2024-03-17')).toBe(true); // ven -> dim
    expect(isStreakContinuation('2024-03-16', '2024-03-18')).toBe(true); // sam -> lun
    expect(isStreakContinuation('2024-03-18', '2024-03-19')).toBe(true); // lun -> mar
  });

  it('breaks when a weekday is missed', () => {
    expect(isStreakContinuation('2024-03-14', '2024-03-18')).toBe(false); // jeu -> lun (ven manqué)
    expect(isStreakContinuation('2024-03-17', '2024-03-19')).toBe(false); // dim -> mar (lun manqué)
  });

  it('returns false for same day, future day, or missing previous day', () => {
    expect(isStreakContinuation('2024-03-18', '2024-03-18')).toBe(false);
    expect(isStreakContinuation('2024-03-19', '2024-03-18')).toBe(false);
    expect(isStreakContinuation(null, '2024-03-18')).toBe(false);
    expect(isStreakContinuation(undefined, '2024-03-18')).toBe(false);
  });
});

describe('localDayBounds', () => {
  it('returns a 24h ISO range starting at local midnight', () => {
    const { dayStart, dayEnd } = localDayBounds();
    const start = new Date(dayStart);
    const end = new Date(dayEnd);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });
});
