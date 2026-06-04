import type { JobPostingDraft } from '@joblog/shared';
import { extractCompanyWebsite, injectSaveButton, parseContractType } from '../../utils/content-script';

export default defineContentScript({
  matches: [
    'https://www.hellowork.com/fr-fr/emploi/*/offre*',
    'https://www.hellowork.com/fr-fr/emplois/*.html',
  ],
  main() {
    injectSaveButton(extract);
  },
});

function extract(): JobPostingDraft {
  const title = document.querySelector<HTMLElement>('h1')?.innerText?.trim() ?? '';

  const company =
    document.querySelector<HTMLElement>('[data-cy="job-company-name"]')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('.company-name')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('[class*="company"]')?.innerText?.trim() ??
    '';

  const location =
    document.querySelector<HTMLElement>('[data-cy="job-location"]')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('.job-location')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('[class*="location"]')?.innerText?.trim() ??
    null;

  const description =
    document.querySelector<HTMLElement>('.job-description, [data-cy="job-description"], [class*="description"]')?.innerText?.trim() ?? null;

  const contract_type = parseContractType(
    document.querySelector<HTMLElement>('[data-cy="job-contract-type"]')?.innerText ?? ''
  );

  return {
    url: window.location.href,
    source: 'hellowork',
    title,
    company,
    location,
    description,
    contract_type,
    remote: null,
    salary: null,
    requirements: null,
    keywords: null,
    company_website: extractCompanyWebsite(company),
  };
}
