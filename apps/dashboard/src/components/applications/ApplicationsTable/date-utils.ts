import { localDayKey } from '@joblog/shared';

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function dateStatus(iso: string): 'past' | 'today' | 'future' {
  const dayKey = localDayKey(new Date(iso));
  const todayKey = localDayKey();
  if (dayKey < todayKey) return 'past';
  if (dayKey === todayKey) return 'today';
  return 'future';
}
