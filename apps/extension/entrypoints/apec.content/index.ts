import type { JobPostingDraft } from '@joblog/shared';
import { cleanText, extractCompanyWebsite, extractStructuredJobPosting, injectSaveButton, parseContractType, parseRemote } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/*'],
  main() {
    injectSaveButton(extract);
  },
});

function extract(): JobPostingDraft {
  const structured = extractStructuredJobPosting();
  const pageText = document.body.innerText;
  const title = cleanText(document.querySelector<HTMLElement>('h1')?.innerText) ?? structured.title ?? '';
  const company =
    structured.company ??
    cleanText(document.querySelector<HTMLElement>('[class*="company"], [class*="entreprise"]')?.innerText) ??
    '';

  return {
    url: window.location.href,
    source: 'apec',
    title,
    company,
    location: structured.location ?? cleanText(document.querySelector<HTMLElement>('[class*="location"], [class*="lieu"]')?.innerText) ?? null,
    description: structured.description ?? cleanText(document.querySelector<HTMLElement>('[class*="description"], article')?.innerText) ?? null,
    contract_type: parseContractType(pageText),
    remote: parseRemote(pageText),
    salary: null,
    requirements: null,
    keywords: structured.keywords ?? null,
    company_website: extractCompanyWebsite(company),
  };
}
