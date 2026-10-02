import { injectCaptureButton } from '../../utils/content-script';

export default defineContentScript({
  matches: [
    'https://welcometothejungle.com/*',
    'https://www.welcometothejungle.com/*',
  ],
  main() {
    injectCaptureButton({
      sourceHint: 'wttj',
      shouldShow: isJobPage,
      getNativeJobId: getJobSlug,
      getPreferredRootSelector: () => document.querySelector('main') ? 'main' : undefined,
    });
  },
});

function isJobPage() {
  return /\/jobs\/[^/]+\/?$/i.test(window.location.pathname);
}

function getJobSlug() {
  return window.location.pathname.match(/\/jobs\/([^/]+)\/?$/i)?.[1] ?? null;
}
