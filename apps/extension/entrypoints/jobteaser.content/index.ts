import { injectCaptureButton } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://www.jobteaser.com/*/offers/*'],
  main() {
    injectCaptureButton({
      sourceHint: 'jobteaser',
      getNativeJobId: () => window.location.pathname.split('/').filter(Boolean).at(-1) ?? null,
    });
  },
});
