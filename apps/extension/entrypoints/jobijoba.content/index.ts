import type { JobPostingDraft } from '@joblog/shared';
import { extractCompanyWebsite, injectSaveButton, parseContractType, parseRemote } from '../../utils/content-script';

const UNKNOWN_COMPANY = 'Entreprise inconnue';

export default defineContentScript({
  matches: ['https://www.jobijoba.com/fr/annonce/*'],
  main() {
    injectSaveButton(extract);
  },
});

function permalinkInfo(iconClass: string) {
  for (const info of document.querySelectorAll('.permalink-info')) {
    if (info.querySelector(`.${iconClass}`)) {
      return info.textContent?.trim() ?? '';
    }
  }
  return '';
}

function extract(): JobPostingDraft {
  const title =
    permalinkInfo('icon-resume-briefcase') ||
    document.querySelector<HTMLElement>('h1')?.innerText?.trim() ||
    '';

  const company = permalinkInfo('icon-apartment') || UNKNOWN_COMPANY;

  const location = permalinkInfo('icon-map-marker') || null;

  const description =
    document.querySelector<HTMLElement>('[class*="description"]')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('article')?.innerText?.trim() ??
    null;

  const pageText = document.body.innerText;
  const contractFromPermalink = permalinkInfo('icon-file-text2');

  return {
    url: window.location.href,
    source: 'jobijoba',
    title,
    company,
    location,
    description,
    contract_type: parseContractType(contractFromPermalink || pageText),
    remote: parseRemote(pageText),
    salary: null,
    requirements: null,
    keywords: null,
    company_website: extractCompanyWebsite(company),
  };
}
