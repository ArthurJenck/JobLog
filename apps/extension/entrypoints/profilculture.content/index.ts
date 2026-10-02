import { injectCaptureButton } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://www.profilculture.com/annonce/*.html'],
  main() {
    injectCaptureButton({
      sourceHint: 'profilculture',
      shouldShow: () => Boolean(document.querySelector('.offre_zone.offre_details')),
      getNativeJobId: () => window.location.pathname.match(/\/annonce\/([^/]+)\.html/i)?.[1] ?? null,
      getPreferredRootSelector: () => document.querySelector('.offre_zone.offre_details')
        ? '.offre_zone.offre_details'
        : undefined,
    });
  },
});
