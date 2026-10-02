import { injectCaptureButton } from '../../utils/content-script';
import { getLinkedInJobIdFromUrl } from '../../utils/job-identities';

const LINKEDIN_JOB_PATH = /\/jobs\/view\/(\d+)/i;

export default defineContentScript({
  matches: ['https://linkedin.com/jobs/*', 'https://*.linkedin.com/jobs/*'],
  main() {
    injectCaptureButton({
      sourceHint: 'linkedin',
      shouldShow: () => Boolean(getLinkedInJobId()),
      getNativeJobId: getLinkedInJobId,
      getPreferredRootSelector: getLinkedInPanelSelector,
      getCaptureUrl: getLinkedInCaptureUrl,
    });
  },
});

function getLinkedInJobId() {
  const fromUrl = getLinkedInJobIdFromUrl(window.location.href);
  if (fromUrl) return fromUrl;

  const selected = document.querySelector<HTMLElement>(
    '[aria-current="true"][data-occludable-job-id], .jobs-search-results__list-item--active, [data-selected="true"][data-job-id]',
  );
  const fromAttribute = readLinkedInId(selected);
  if (fromAttribute) return fromAttribute;

  const selectedLink = document.querySelector<HTMLAnchorElement>(
    '.jobs-search-results__list-item--active a[href*="/jobs/view/"], [aria-current="true"][href*="/jobs/view/"], [data-selected="true"] a[href*="/jobs/view/"]',
  );
  const fromSelectedLink = selectedLink?.href.match(LINKEDIN_JOB_PATH)?.[1];
  if (fromSelectedLink) return fromSelectedLink;

  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  const fromCanonical = canonical?.match(LINKEDIN_JOB_PATH)?.[1];
  if (fromCanonical) return fromCanonical;

  const openGraphUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content;
  return openGraphUrl?.match(LINKEDIN_JOB_PATH)?.[1] ?? null;
}

function readLinkedInId(element: HTMLElement | null) {
  if (!element) return null;
  const values = [
    element.dataset.occludableJobId,
    element.dataset.jobId,
    element.dataset.entityUrn,
    element.getAttribute('data-entity-urn'),
  ];
  for (const value of values) {
    const id = value?.match(/(\d{6,})/)?.[1];
    if (id) return id;
  }
  return null;
}

function getLinkedInCaptureUrl() {
  const jobId = getLinkedInJobId();
  return jobId ? `https://www.linkedin.com/jobs/view/${encodeURIComponent(jobId)}/` : undefined;
}

function getLinkedInPanelSelector() {
  return firstExistingSelector([
    '.jobs-search__job-details--container',
    '.jobs-details__main-content',
    '.job-view-layout',
    'main',
  ]);
}

function firstExistingSelector(selectors: string[]) {
  return selectors.find((selector) => document.querySelector(selector));
}
