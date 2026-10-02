import { injectCaptureButton } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://www.meteojob.com/jobs/*'],
  main() {
    injectCaptureButton({
      sourceHint: 'meteojob',
      getNativeJobId: () => window.location.pathname.split('/').filter(Boolean).at(-1) ?? null,
    });
  },
});
