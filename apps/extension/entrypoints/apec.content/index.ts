import { injectCaptureButton } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/*'],
  main() {
    injectCaptureButton({ sourceHint: 'apec' });
  },
});
