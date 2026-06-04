import type { JobPostingDraft } from '@joblog/shared';
import { extractCompanyWebsite, injectSaveButton, parseContractType, parseRemote } from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://www.linkedin.com/jobs/view/*'],
  main() {
    injectSaveButton(extract);
  },
});

function extract(): JobPostingDraft {
  const title =
    document.querySelector<HTMLElement>('.job-details-jobs-unified-top-card__job-title h1')?.innerText?.trim() ??
    document.querySelector<HTMLElement>('h1')?.innerText?.trim() ??
    '';

  const company =
    document.querySelector<HTMLElement>('.job-details-jobs-unified-top-card__company-name')?.innerText?.trim() ??
    '';

  const location =
    document.querySelector<HTMLElement>('.job-details-jobs-unified-top-card__bullet')?.innerText?.trim() ?? null;

  const description =
    document.querySelector<HTMLElement>('.jobs-description__content')?.innerText?.trim() ?? null;

  const detailsText = document.querySelector<HTMLElement>('.job-details-jobs-unified-top-card__job-insight')?.innerText ?? '';
  const contract_type = parseContractType(detailsText);
  const remote = parseRemote(detailsText);

  return {
    url: window.location.href,
    source: 'linkedin',
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
