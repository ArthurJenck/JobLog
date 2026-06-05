import type { ApplicationWithJob, ScrapeStatus } from '@joblog/shared';

export function getJobScrapeStatus(
  jobPosting: ApplicationWithJob['jobPosting'] | null | undefined,
): ScrapeStatus {
  const status = jobPosting?.scrape_status;
  if (
    status === 'queued' ||
    status === 'processing' ||
    status === 'failed' ||
    status === 'succeeded'
  ) {
    return status;
  }

  return 'succeeded';
}

export function isScrapeActive(app: ApplicationWithJob | null | undefined) {
  const status = getJobScrapeStatus(app?.jobPosting);
  return status === 'queued' || status === 'processing';
}

export function isScrapeReady(app: ApplicationWithJob | null | undefined) {
  return getJobScrapeStatus(app?.jobPosting) === 'succeeded';
}

export function getScrapeStatusLabel(status: ScrapeStatus) {
  switch (status) {
    case 'queued':
      return 'En attente';
    case 'processing':
      return 'Récupération';
    case 'failed':
      return 'Échec';
    case 'succeeded':
      return 'Prête';
  }
}
