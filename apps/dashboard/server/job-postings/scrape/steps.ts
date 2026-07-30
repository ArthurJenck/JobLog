import { SCRAPE_STEP_KEYS, type ScrapeStatus } from '@joblog/shared';
import { isBlockedOrErrorContent } from './content-filters.js';

export type ScrapeStep = {
  key: (typeof SCRAPE_STEP_KEYS)[number];
  label: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  at: Date | null;
  message?: string | null;
};

type ScrapeStatusInput = {
  scrape_status?: ScrapeStatus | null;
  title?: unknown;
  company?: unknown;
  description?: unknown;
};

const STEP_LABELS: Record<(typeof SCRAPE_STEP_KEYS)[number], string> = {
  created: 'Candidature créée',
  fetch: 'Lecture de la page',
  extract: 'Extraction des informations',
  normalize: 'Normalisation',
  complete: 'Offre prête',
};

export function buildInitialSteps(now: Date): ScrapeStep[] {
  return SCRAPE_STEP_KEYS.map((key) => ({
    key,
    label: STEP_LABELS[key],
    status: key === 'created' ? 'succeeded' : 'pending',
    at: key === 'created' ? now : null,
    message: null,
  }));
}

export function markStep(
  steps: ScrapeStep[],
  key: ScrapeStep['key'],
  status: ScrapeStep['status'],
  at: Date,
  message?: string | null,
) {
  return steps.map((step) =>
    step.key === key
      ? { ...step, status, at, message: message ?? step.message ?? null }
      : step,
  );
}

export function markCurrentStepFailed(steps: ScrapeStep[], message: string) {
  const active =
    steps.find((step) => step.status === 'processing') ??
    steps.find((step) => step.status === 'pending') ??
    steps[steps.length - 1];

  return steps.map((step) =>
    step.key === active.key
      ? { ...step, status: 'failed' as const, at: new Date(), message }
      : step,
  );
}

export function getScrapeStatus(jobPosting: ScrapeStatusInput): ScrapeStatus {
  if (
    jobPosting.scrape_status === 'queued' ||
    jobPosting.scrape_status === 'processing' ||
    jobPosting.scrape_status === 'failed' ||
    jobPosting.scrape_status === 'succeeded'
  ) {
    return jobPosting.scrape_status;
  }

  return isBlockedLegacyJobPosting(jobPosting) ? 'failed' : 'succeeded';
}

export function isReadyJobPosting(jobPosting: ScrapeStatusInput) {
  return getScrapeStatus(jobPosting) === 'succeeded' && !isBlockedLegacyJobPosting(jobPosting);
}

export function isBlockedLegacyJobPosting(jobPosting: ScrapeStatusInput) {
  if (jobPosting.scrape_status) return false;

  return isBlockedOrErrorContent({
    title: String(jobPosting.title ?? ''),
    company: String(jobPosting.company ?? ''),
    content: String(jobPosting.description ?? ''),
    status: null,
  });
}
