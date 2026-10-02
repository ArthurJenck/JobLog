import { injectCaptureButton } from '../../utils/content-script';
import { getIndeedJobKeyFromUrl } from '../../utils/job-identities';

const JOB_KEY_PATTERN = /[?&](?:jk|vjk)=([^&#]+)/i;

export default defineContentScript({
  matches: ['https://*.indeed.com/viewjob*', 'https://*.indeed.com/jobs*'],
  main() {
    injectCaptureButton({
      sourceHint: 'indeed',
      shouldShow: () => Boolean(getIndeedJobKey() || window.location.pathname.includes('/viewjob')),
      getNativeJobId: getIndeedJobKey,
      getPreferredRootSelector: getIndeedPanelSelector,
      getCaptureUrl: getIndeedCaptureUrl,
    });
  },
});

function getIndeedJobKey() {
  const fromUrl = getIndeedJobKeyFromUrl(window.location.href);
  if (fromUrl) return fromUrl;

  const selected = document.querySelector<HTMLElement>(
    '[aria-selected="true"], [aria-current="true"][data-jk], .job_seen_beacon[aria-current="true"]',
  );
  const selectedLink = document.querySelector<HTMLAnchorElement>(
    '[aria-selected="true"] a[href*="jk="], [aria-current="true"] a[href*="jk="], a[aria-current="page"][href*="jk="]',
  );
  const fromSelectedLink = selectedLink?.href.match(JOB_KEY_PATTERN)?.[1];
  if (fromSelectedLink) return decodeURIComponent(fromSelectedLink);

  const selectedContainer = selected?.closest('[data-jk], [data-jobkey]') ?? selected;
  const fromDataset = selectedContainer?.getAttribute('data-jk') ?? selectedContainer?.getAttribute('data-jobkey');
  if (fromDataset) return fromDataset;

  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  return canonical ? getIndeedJobKeyFromUrl(canonical) : null;
}

function getIndeedPanelSelector() {
  return firstExistingSelector(['#jobsearch-ViewjobPaneWrapper', '.jobsearch-ViewJobLayout', '#viewJobSSRRoot']);
}

function getIndeedCaptureUrl() {
  const jobKey = getIndeedJobKey();
  return jobKey
    ? `${window.location.origin}/viewjob?jk=${encodeURIComponent(jobKey)}`
    : undefined;
}

function firstExistingSelector(selectors: string[]) {
  return selectors.find((selector) => document.querySelector(selector));
}
