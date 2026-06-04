import type { JobPostingDraft } from '@joblog/shared';
import { extractCompanyWebsite, injectSaveButton, parseContractType, parseRemote } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://*.indeed.com/viewjob*', 'https://*.indeed.com/jobs*'],
  main() {
    injectSaveButton(extract);
  },
});

function extract(): JobPostingDraft {
  const title =
    document.querySelector<HTMLElement>('[data-testid="jobsearch-JobInfoHeader-title"]')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('h1')?.innerText?.trim() ??
    '';

  const company =
    document.querySelector<HTMLElement>('[data-testid="inlineHeader-companyName"]')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('.jobsearch-InlineCompanyRating-companyHeader a')?.innerText?.trim() ??
    '';

  const location =
    document.querySelector<HTMLElement>('[data-testid="job-location"]')?.innerText?.trim() ?? null;

  const description =
    document.querySelector<HTMLElement>('#jobDescriptionText')?.innerText?.trim() ?? null;

  const metaText =
    document.querySelector<HTMLElement>('[data-testid="jobsearch-JobMetadataHeader"]')?.innerText ?? '';
  const contract_type = parseContractType(metaText);
  const remote = parseRemote(metaText);

  return {
    url: window.location.href,
    source: 'indeed',
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
