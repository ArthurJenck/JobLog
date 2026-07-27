import type { JobPostingDraft } from '@joblog/shared';
import { extractCompanyWebsite, injectSaveButton, parseContractType, parseRemote } from '../../utils/content-script';

export default defineContentScript({
  matches: [
    'https://*.glassdoor.com/job-listing/*',
    'https://*.glassdoor.com/Job/*',
    'https://*.glassdoor.com/Jobs/*',
    'https://*.glassdoor.fr/job-listing/*',
    'https://*.glassdoor.fr/Emploi/*',
    'https://*.glassdoor.fr/Jobs/*',
  ],
  main() {
    injectSaveButton(extract);
  },
});

function extract(): JobPostingDraft {
  const title =
    document.querySelector<HTMLElement>('[data-test="job-details-header"] h1')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('h1')?.innerText?.trim() ??
    '';

  const company =
    document.querySelector<HTMLElement>('[data-test="job-details-header"] h4')?.innerText?.trim() ??
    '';

  const location =
    document.querySelector<HTMLElement>('[data-test="location"]')?.innerText?.trim() ?? null;

  const description =
    document.querySelector<HTMLElement>('[class*="JobDetails_jobDescription__"]')?.innerText?.trim() ??
    null;

  const metaText = document.body?.innerText ?? '';
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
