import type { JobPostingDraft } from '@joblog/shared';
import { extractCompanyWebsite, injectSaveButton, parseContractType, parseRemote } from '../../utils/content-script';

export default defineContentScript({
  matches: [
    'https://welcometothejungle.com/*',
    'https://www.welcometothejungle.com/*',
  ],
  main() {
    injectSaveButton(extract, isJobPage);
  },
});

function isJobPage() {
  return window.location.pathname.includes('/jobs/');
}

function extract(): JobPostingDraft {
  const title =
    document.querySelector<HTMLElement>('[data-testid="job-header-title"]')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('h1')?.innerText?.trim() ??
    '';

  const company =
    document.querySelector<HTMLElement>('[data-testid="job-header-company-name"]')?.innerText?.trim() ??
    document.querySelector<HTMLAnchorElement>('a[href*="/companies/"]')?.innerText?.trim() ??
    '';

  const location =
    document.querySelector<HTMLElement>('[data-testid="job-header-location"]')?.innerText?.trim() ?? null;

  const description =
    document.querySelector<HTMLElement>('[data-testid="job-section-description"]')?.innerText?.trim() ?? null;

  const contract_type = parseContractType(
    document.querySelector<HTMLElement>('[data-testid="job-header-contract-type"]')?.innerText ?? ''
  );

  const remote = parseRemote(
    document.querySelector<HTMLElement>('[data-testid="job-header-remote"]')?.innerText ?? ''
  );

  const keywords = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="job-tag"]'))
    .map((el) => el.innerText.trim())
    .filter(Boolean);

  return {
    url: window.location.href,
    source: 'wttj',
    title,
    company,
    location,
    description,
    contract_type,
    remote,
    salary: null,
    requirements: null,
    keywords: keywords.length ? keywords : null,
    company_website: extractCompanyWebsite(company),
  };
}
