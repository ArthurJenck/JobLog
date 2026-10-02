import { injectCaptureButton } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://jobboard.asfored.org/offres/*'],
  main() {
    injectCaptureButton({
      sourceHint: 'asfored',
      shouldShow: () => Boolean(getOfferId() && getOfferRootSelector()),
      getNativeJobId: getOfferId,
      getPreferredRootSelector: getOfferRootSelector,
      getCaptureUrl: getOfferUrl,
    });
  },
});

function getOfferId() {
  const hash = window.location.hash.replace(/^#!/, '').replace(/^#/, '');
  return new URLSearchParams(hash).get('oe');
}

function getOfferRootSelector() {
  const offerId = getOfferId();
  if (!offerId) return undefined;
  const escapedId = CSS.escape(offerId);
  const selector = `.jb-modal.offre[data-oid="${escapedId}"] .offre-content`;
  return document.querySelector(selector) ? selector : undefined;
}

function getOfferUrl() {
  const offerId = getOfferId();
  if (!offerId) return undefined;
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set('oe', offerId);
  return url.href;
}
