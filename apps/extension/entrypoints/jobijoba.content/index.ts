import { injectCaptureButton } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://www.jobijoba.com/fr/annonce/*'],
  main() {
    injectCaptureButton({
      sourceHint: 'jobijoba',
      getNativeJobId: () => window.location.pathname.split('/').filter(Boolean).at(-1) ?? null,
    });
  },
});
