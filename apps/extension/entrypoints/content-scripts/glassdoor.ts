import type { JobPostingDraft } from '@joblog/shared';
import { extractCompanyWebsite, injectSaveButton, parseContractType, parseRemote } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://www.glassdoor.*/job-listing/*', 'https://www.glassdoor.*/Jobs/*'],
  main() {
    injectSaveButton(extract);
  },
});

function extract(): JobPostingDraft {
  const title =
    document.querySelector<HTMLElement>('[data-test="job-title"]')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('h1')?.innerText?.trim() ??
    '';

  const company =
    document.querySelector<HTMLElement>('[data-test="employer-name"]')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('.employerName')?.innerText?.trim() ??
    '';

  const location =
    document.querySelector<HTMLElement>('[data-test="location"]')?.innerText?.trim() ?? null;

  const description =
    document.querySelector<HTMLElement>('[class*="JobDetails_jobDescriptionWrapper"]')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('#JobDescriptionContainer')?.innerText?.trim() ??
    null;

  const metaText = document.querySelector<HTMLElement>('[data-test="job-metadata"]')?.innerText ?? '';
  const contract_type = parseContractType(metaText);
  const remote = parseRemote(metaText);

  return {
    url: window.location.href,
    source: 'glassdoor',
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
