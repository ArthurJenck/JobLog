import { injectCaptureButton } from '../../utils/content-script';

export default defineContentScript({
  matches: [
    'https://candidat.francetravail.fr/offres/recherche/detail/*',
  ],
  main() {
    injectCaptureButton({
      sourceHint: 'francetravail',
      getNativeJobId: () => window.location.pathname.split('/').filter(Boolean).at(-1) ?? null,
    });
  },
});
