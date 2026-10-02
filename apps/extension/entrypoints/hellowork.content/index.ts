import { injectCaptureButton } from '../../utils/content-script';

export default defineContentScript({
  matches: [
    'https://www.hellowork.com/fr-fr/emploi/*/offre*',
    'https://www.hellowork.com/fr-fr/emplois/*.html',
  ],
  main() {
    injectCaptureButton({
      sourceHint: 'hellowork',
      shouldShow: isJobPage,
      getNativeJobId: getHelloWorkJobId,
      getPreferredRootSelector: () => firstExistingSelector(['main', '[data-cy="job-detail"]']),
    });
  },
});

function isJobPage() {
  return /\/fr-fr\/(?:emploi\/.+\/offre|emplois\/[^/]+\.html)/i.test(window.location.pathname);
}

function getHelloWorkJobId() {
  const match = window.location.pathname.match(/\/emplois\/([^/]+)\.html/i);
  return match?.[1] ?? null;
}

function firstExistingSelector(selectors: string[]) {
  return selectors.find((selector) => document.querySelector(selector));
}
