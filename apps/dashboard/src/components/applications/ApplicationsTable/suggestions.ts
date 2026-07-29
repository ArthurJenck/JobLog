import {
  TERMINAL_STATUSES,
  type ApplicationWithJob,
} from '@joblog/shared';
import { isScrapeReady } from '@/lib/scrape';

const THANK_YOU_WINDOW_DAYS = 7;
const GHOST_STALE_DAYS = 14;

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

export function getSuggestion(app: ApplicationWithJob): string | null {
  if (!isScrapeReady(app)) return null;

  if ((TERMINAL_STATUSES as readonly string[]).includes(app.status))
    return null;

  const events = app.events ?? [];
  const has = (type: string) => events.some((e) => e.type === type);
  const now = new Date();
  const reminderDue =
    app.reminder?.at != null && new Date(app.reminder.at) <= now;
  const relancesExhausted =
    (app.reminder?.sentCount ?? 0) >= (app.reminder?.maxCount ?? 3);

  if (has('offer_accepted')) return null;

  if (
    has('offer_received') &&
    !has('offer_accepted') &&
    !has('offer_declined')
  ) {
    return "Suggestion : N'oubliez pas de répondre à l'offre.";
  }

  const hasFutureInterview = events.some(
    (e) => e.type === 'interview_scheduled' && new Date(e.at) > now,
  );
  if (hasFutureInterview) return null;

  const frontier = [...events]
    .filter((e) => e.type !== 'custom' && new Date(e.at) <= now)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];

  if (!frontier) return null;

  switch (frontier.type) {
    case 'interview_scheduled':
      return 'Suggestion : Marquez votre entretien comme passé.';

    case 'interview_done':
      if (daysSince(frontier.at) < THANK_YOU_WINDOW_DAYS) {
        return 'Suggestion : Remerciez le recruteur après votre entretien.';
      }
      return 'Suggestion : Marquez le résultat de cet entretien.';

    case 'thank_you_sent':
      if (reminderDue) return 'Suggestion : Relancez pour obtenir un retour.';
      if (daysSince(frontier.at) >= THANK_YOU_WINDOW_DAYS) {
        return 'Suggestion : Marquez le résultat de cet entretien.';
      }
      return null;

    case 'followup_sent':
      if (relancesExhausted || daysSince(frontier.at) >= GHOST_STALE_DAYS) {
        return 'Suggestion : Sans réponse depuis longtemps — marquez-la comme ghostée ?';
      }
      return null;

    case 'response_received':
      return null;

    case 'applied':
      if (reminderDue)
        return 'Suggestion : Envoyez une relance pour ne pas vous faire oublier.';
      if (relancesExhausted || daysSince(frontier.at) >= GHOST_STALE_DAYS) {
        return 'Suggestion : Sans réponse depuis longtemps — marquez-la comme ghostée ?';
      }
      break;

    case 'created':
      if (app.status === 'saved')
        return 'Suggestion : Postulez à cette offre quand vous êtes prêt.';
      break;

    default:
      break;
  }

  if (!app.cvId && app.status !== 'saved') {
    return 'Suggestion : Testez votre CV sur cette offre pour voir si votre profil correspond.';
  }

  return null;
}
