import { injectCaptureButton } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://lesjeudis.com/jobs*'],
  main() {
    injectCaptureButton({
      sourceHint: 'lesjeudis',
      shouldShow: () => Boolean(getJobId()),
      getNativeJobId: getJobId,
      getPreferredRootSelector: () => document.querySelector('main') ? 'main' : undefined,
      getCaptureUrl: getJobUrl,
    });
  },
});

function getJobId() {
  return new URLSearchParams(window.location.search).get('jobId');
}

function getJobUrl() {
  const jobId = getJobId();
  if (!jobId) return undefined;
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set('jobId', jobId);
  return url.href;
}
