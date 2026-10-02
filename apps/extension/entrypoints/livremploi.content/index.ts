import { injectCaptureButton } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://www.livremploi.fr/offre/*', 'https://livremploi.fr/offre/*'],
  main() {
    injectCaptureButton({
      sourceHint: 'livremploi',
      getNativeJobId: () => window.location.pathname.split('/').filter(Boolean).at(-1) ?? null,
      getPreferredRootSelector: () => document.querySelector('main') ? 'main' : undefined,
    });
  },
});
