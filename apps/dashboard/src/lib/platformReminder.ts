import { localDayKey } from '@joblog/shared';

export { localDayBounds, localDayKey } from '@joblog/shared';

export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const startOfLocalDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const then = startOfLocalDay(new Date(iso));
  const now = startOfLocalDay(new Date());
  const diffMs = now.getTime() - then.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function isSameLocalDay(iso: string | null): boolean {
  return daysSince(iso) === 0;
}

export function shiftDayKey(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const shifted = new Date(y, m - 1, d + delta);
  return localDayKey(shifted);
}

export function reminderMessage(lastClickedAt: string | null): string | null {
  const d = daysSince(lastClickedAt);

  if (d === null) {
    return "Vous n'avez pas encore regardé les offres ici, c'est le moment de commencer !";
  }
  if (d === 0) {
    return null;
  }
  if (d === 1) {
    return 'Vous avez regardé les offres hier, mais de nouvelles ont pu être publiées depuis.';
  }
  if (d < 7) {
    return `Ça fait ${d} jours que vous n'avez pas vérifié les offres — il y en a sûrement de nouvelles !`;
  }
  if (d < 30) {
    const weeks = Math.round(d / 7);
    return `Ça fait ${weeks} semaine${weeks > 1 ? 's' : ''} que vous n'êtes pas passé — ne laissez pas filer les nouvelles offres.`;
  }
  const months = Math.round(d / 30);
  return `Ça fait ${months} mois que cette plateforme dort — un petit tour peut réserver de belles surprises.`;
}
