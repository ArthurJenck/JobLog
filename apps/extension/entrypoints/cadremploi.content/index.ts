import { injectCaptureButton } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://www.cadremploi.fr/emploi/detail_offre*'],
  main() {
    injectCaptureButton({ sourceHint: 'cadremploi' });
  },
});
