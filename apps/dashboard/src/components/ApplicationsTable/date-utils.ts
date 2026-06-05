export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function dateStatus(iso: string): 'past' | 'today' | 'future' {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  if (day(d) < day(now)) return 'past';
  if (day(d) === day(now)) return 'today';
  return 'future';
}
