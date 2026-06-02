export const JOB_SOURCES = ['linkedin', 'wttj', 'hellowork', 'indeed', 'glassdoor', 'jobteaser', 'paste', 'manual'] as const;
export type JobSource = typeof JOB_SOURCES[number];

export const APPLICATION_STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected', 'ghosted'] as const;
export type ApplicationStatus = typeof APPLICATION_STATUSES[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: 'Sauvegardée',
  applied: 'Postulée',
  interview: 'Entretien',
  offer: 'Offre',
  rejected: 'Refusée',
  ghosted: 'Ghostée',
};

export const CONTRACT_TYPES = ['cdi', 'cdd', 'alternance', 'stage', 'freelance'] as const;
export type ContractType = typeof CONTRACT_TYPES[number];

export const REMOTE_TYPES = ['remote', 'hybride', 'présentiel'] as const;
export type RemoteType = typeof REMOTE_TYPES[number];

export const EVENT_TYPES = [
  'created',
  'applied',
  'response_received',
  'interview_scheduled',
  'interview_done',
  'thank_you_sent',
  'followup_sent',
  'offer_received',
  'offer_accepted',
  'offer_declined',
  'rejected',
  'ghosted',
  'note',
] as const;
export type EventType = typeof EVENT_TYPES[number];

export const EVENT_LABELS: Record<EventType, string> = {
  created: 'Ajoutée',
  applied: 'Candidature envoyée',
  response_received: 'Réponse reçue',
  interview_scheduled: 'Entretien planifié',
  interview_done: 'Entretien passé',
  thank_you_sent: 'Remerciements envoyés',
  followup_sent: 'Relance envoyée',
  offer_received: 'Offre reçue',
  offer_accepted: 'Offre acceptée',
  offer_declined: 'Offre déclinée',
  rejected: 'Refusée',
  ghosted: 'Ghostée',
  note: 'Note',
};

export const SCRAPE_METHODS = ['extension', 'cheerio', 'gemini', 'manual'] as const;
export type ScrapeMethod = typeof SCRAPE_METHODS[number];

export const GEMINI_DAILY_QUOTA = 1500;
export const GEMINI_SCRAPE_RESERVE = 100;
export const GEMINI_MODEL = 'gemini-2.0-flash';
