export const JOB_SOURCES = [
    'linkedin',
    'wttj',
    'hellowork',
    'indeed',
    'glassdoor',
    'jobteaser',
    'jobijoba',
    'meteojob',
    'apec',
    'francetravail',
    'cadremploi',
    'talent',
    'lesjeudis',
    'paste',
    'manual',
] as const
export type JobSource = (typeof JOB_SOURCES)[number]

export const APPLICATION_STATUSES = [
    'saved',
    'applied',
    'interview',
    'offer',
    'accepted',
    'rejected',
    'ghosted',
    'cancelled',
] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
    saved: 'Sauvegardée',
    applied: 'Postulée',
    interview: 'Entretien',
    offer: 'Offre',
    accepted: 'Acceptée',
    rejected: 'Refusée',
    ghosted: 'Ghostée',
    cancelled: 'Annulée',
}

export const ACTIVE_STATUSES: ApplicationStatus[] = ['saved', 'applied', 'interview', 'offer']
export const TERMINAL_STATUSES: ApplicationStatus[] = ['rejected', 'ghosted', 'cancelled', 'accepted']

export const CONTRACT_TYPES = [
    'cdi',
    'cdd',
    'alternance',
    'stage',
    'freelance',
] as const
export type ContractType = (typeof CONTRACT_TYPES)[number]

export const CONTRACT_LABELS: Record<ContractType, string> = {
  cdi: 'CDI',
  cdd: 'CDD',
  alternance: 'Alternance',
  stage: 'Stage',
  freelance: 'Freelance',
}

export const REMOTE_TYPES = ['remote', 'hybride', 'présentiel'] as const
export type RemoteType = (typeof REMOTE_TYPES)[number]

export const REMOTE_LABELS: Record<RemoteType, string> = {
  remote: 'Full remote',
  hybride: 'Hybride',
  présentiel: 'Présentiel',
}

export const LOCATION_NORMALIZATION_STATUSES = [
    'matched',
    'unmatched',
    'ambiguous',
    'skipped',
    'error',
] as const
export type LocationNormalizationStatus = (typeof LOCATION_NORMALIZATION_STATUSES)[number]

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
    'cancelled',
    'custom',
] as const
export type EventType = (typeof EVENT_TYPES)[number]

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
    cancelled: 'Annulée',
    custom: 'Note personnalisée',
}

export const EVENT_AUTO_STATUS: Partial<Record<EventType, ApplicationStatus>> = {
    applied: 'applied',
    interview_scheduled: 'interview',
    offer_received: 'offer',
    offer_accepted: 'accepted',
    offer_declined: 'rejected',
    rejected: 'rejected',
    ghosted: 'ghosted',
    cancelled: 'cancelled',
}

export const STATUS_EVENT: Partial<Record<ApplicationStatus, EventType>> = {
    applied: 'applied',
    interview: 'interview_scheduled',
    offer: 'offer_received',
    accepted: 'offer_accepted',
    rejected: 'rejected',
    ghosted: 'ghosted',
    cancelled: 'cancelled',
}

const STATUS_PIPELINE_ORDER: Record<ApplicationStatus, number> = {
    rejected: -1, ghosted: -1, cancelled: -1, accepted: -1,
    saved: 0, applied: 1, interview: 2, offer: 3,
}

const FORCED_STATUS_EVENTS: ReadonlySet<EventType> = new Set([
    'offer_declined', 'rejected', 'ghosted', 'cancelled',
])

export function resolveStatusOnEvent(
    current: ApplicationStatus,
    type: EventType,
): ApplicationStatus | null {
    const target = EVENT_AUTO_STATUS[type]
    if (!target) return null
    if (FORCED_STATUS_EVENTS.has(type)) return target === current ? null : target
    return STATUS_PIPELINE_ORDER[current] < STATUS_PIPELINE_ORDER[target] ? target : null
}

export function deriveStatusFromEvents(
    events: Array<{ type: EventType; at: Date | string }>,
): ApplicationStatus {
    let best: ApplicationStatus = 'saved'
    let bestOrder = 0
    let terminal: { status: ApplicationStatus; at: number } | null = null

    for (const e of events) {
        const s = EVENT_AUTO_STATUS[e.type]
        if (!s) continue
        if (FORCED_STATUS_EVENTS.has(e.type)) {
            const t = new Date(e.at).getTime()
            if (!terminal || t >= terminal.at) terminal = { status: s, at: t }
        } else if (STATUS_PIPELINE_ORDER[s] > bestOrder) {
            bestOrder = STATUS_PIPELINE_ORDER[s]
            best = s
        }
    }
    return terminal ? terminal.status : best
}

export const EVENT_PIPELINE: EventType[] = [
    'created',
    'applied',
    'response_received',
    'interview_scheduled',
    'interview_done',
    'offer_received',
    'offer_accepted',
]

export const SCRAPE_METHODS = [
    'extension',
    'cheerio',
    'gemini',
    'jina',
    'manual',
] as const
export type ScrapeMethod = (typeof SCRAPE_METHODS)[number]

export const GEMINI_DAILY_QUOTA = 1500
export const GEMINI_SCRAPE_RESERVE = 100
export const GEMINI_MODEL = 'gemini-2.5-flash-lite'
