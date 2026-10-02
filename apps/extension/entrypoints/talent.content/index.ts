import { injectCaptureButton } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://fr.talent.com/jobs*'],
  main() {
    injectCaptureButton({
      sourceHint: 'talent',
      shouldShow: () => Boolean(getJobId()),
      getNativeJobId: getJobId,
      getPreferredRootSelector: () => document.querySelector('main') ? 'main' : undefined,
      getCaptureUrl: getJobUrl,
    });
  },
});

function getJobId() {
  return new URLSearchParams(window.location.search).get('id');
}

function getJobUrl() {
  const jobId = getJobId();
  if (!jobId) return undefined;
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set('id', jobId);
  return url.href;
}
