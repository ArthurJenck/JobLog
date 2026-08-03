export const PARIS_TIME_ZONE = 'Europe/Paris';

export function getParisDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: PARIS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function getParisMonthKey(date: Date = new Date()): string {
  return getParisDateKey(date).slice(0, 7);
}

export function normalizeFrequencyDays(value: unknown): number {
  const days = Number(value);
  return Number.isFinite(days) && days > 0 ? Math.trunc(days) : 7;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function localDayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function localDayBounds(): { dayStart: string; dayEnd: string } {
  const start = startOfLocalDay(new Date());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart: start.toISOString(), dayEnd: end.toISOString() };
}

function shiftDayKeyUTC(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function isWeekendDayKey(day: string): boolean {
  const dow = new Date(`${day}T00:00:00.000Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

export function isStreakContinuation(
  previousDay: string | null | undefined,
  today: string,
): boolean {
  if (!previousDay || previousDay >= today) return false;
  let cursor = shiftDayKeyUTC(previousDay, 1);
  while (cursor < today) {
    if (!isWeekendDayKey(cursor)) return false;
    cursor = shiftDayKeyUTC(cursor, 1);
  }
  return true;
}
