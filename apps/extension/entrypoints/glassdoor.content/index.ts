import { injectCaptureButton } from '../../utils/content-script';
import { getGlassdoorListingIdFromUrl } from '../../utils/job-identities';

const LISTING_ID_PATTERN = /[?&](?:jl|jobListingId)=([^&#]+)/i;

export default defineContentScript({
  matches: [
    'https://*.glassdoor.com/job-listing/*',
    'https://*.glassdoor.com/Job/*',
    'https://*.glassdoor.com/Jobs/*',
    'https://*.glassdoor.fr/job-listing/*',
    'https://*.glassdoor.fr/Emploi/*',
    'https://*.glassdoor.fr/Jobs/*',
  ],
  main() {
    injectCaptureButton({
      sourceHint: 'glassdoor',
      shouldShow: () => Boolean(extractListingId()),
      getNativeJobId: extractListingId,
      getPreferredRootSelector: getGlassdoorPanelSelector,
      getCaptureUrl: getGlassdoorCaptureUrl,
    });
  },
});

function extractListingId() {
  const fromUrl = getGlassdoorListingIdFromUrl(window.location.href);
  if (fromUrl) return fromUrl;

  const selectedLink = document.querySelector<HTMLAnchorElement>(
    '[data-test="job-details-header"] a[href*="jl="], li[data-selected="true"] a[href*="jl="], li.selected a[href*="jl="]',
  );
  const fromSelectedLink = selectedLink?.getAttribute('href')?.match(LISTING_ID_PATTERN)?.[1];
  if (fromSelectedLink) return decodeURIComponent(fromSelectedLink);

  const fromDataset = document
    .querySelector<HTMLElement>('li[data-selected="true"] [data-jobid], li.selected [data-jobid]')
    ?.getAttribute('data-jobid');
  if (fromDataset) return fromDataset;

  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  return canonical ? getGlassdoorListingIdFromUrl(canonical) : null;
}

function getGlassdoorPanelSelector() {
  return firstExistingSelector([
    '[class*="JobDetails_jobDetails"]',
    '[data-test="job-details"]',
    '#JobView',
  ]);
}

function getGlassdoorCaptureUrl() {
  const listingId = extractListingId();
  return listingId
    ? `${window.location.origin}/job-listing/j?jl=${encodeURIComponent(listingId)}`
    : undefined;
}

function firstExistingSelector(selectors: string[]) {
  return selectors.find((selector) => document.querySelector(selector));
}
