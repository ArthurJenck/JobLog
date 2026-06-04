import type { JobPostingDraft } from '@joblog/shared';
import { extractCompanyWebsite, injectSaveButton, parseContractType, parseRemote } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://www.jobijoba.com/fr/annonce/*'],
  main() {
    injectSaveButton(extract);
  },
});

function extract(): JobPostingDraft {
  const title =
    document.querySelector<HTMLElement>('h1')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('[class*="title"]')?.innerText?.trim() ??
    '';

  const company =
    document.querySelector<HTMLElement>('[class*="company"]')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('[class*="recruiter"]')?.innerText?.trim() ??
    '';

  const location =
    document.querySelector<HTMLElement>('[class*="location"]')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('[class*="city"]')?.innerText?.trim() ??
    null;

  const description =
    document.querySelector<HTMLElement>('[class*="description"]')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('article')?.innerText?.trim() ??
    null;

  const pageText = document.body.innerText;

  return {
    url: window.location.href,
    source: 'jobijoba',
    title,
    company,
    location,
    description,
    contract_type: parseContractType(pageText),
    remote: parseRemote(pageText),
    salary: null,
    requirements: null,
    keywords: null,
    company_website: extractCompanyWebsite(company),
  };
}
