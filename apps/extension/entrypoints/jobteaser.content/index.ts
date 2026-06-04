import type { JobPostingDraft } from '@joblog/shared';
import { extractCompanyWebsite, injectSaveButton, parseContractType, parseRemote } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://www.jobteaser.com/*/offers/*'],
  main() {
    injectSaveButton(extract);
  },
});

function extract(): JobPostingDraft {
  const title =
    document.querySelector<HTMLElement>('h1')?.innerText?.trim() ?? '';

  const company =
    document.querySelector<HTMLElement>('[data-testid="company-name"]')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('.company-name')?.innerText?.trim() ??
    '';

  const location =
    document.querySelector<HTMLElement>('[data-testid="job-location"]')?.innerText?.trim() ?? null;

  const description =
    document.querySelector<HTMLElement>('[data-testid="job-description"]')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('.job-description')?.innerText?.trim() ??
    null;

  const metaText = document.querySelector<HTMLElement>('[data-testid="job-details"]')?.innerText ?? '';
  const contract_type = parseContractType(metaText);
  const remote = parseRemote(metaText);

  return {
    url: window.location.href,
    source: 'jobteaser',
    title,
    company,
    location,
    description,
    contract_type,
    remote,
    salary: null,
    requirements: null,
    keywords: null,
    company_website: extractCompanyWebsite(company),
  };
}
