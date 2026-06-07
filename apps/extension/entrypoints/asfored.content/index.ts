import type { JobPostingDraft } from '@joblog/shared';
import {
  cleanText,
  extractCompanyWebsite,
  injectSaveButton,
  parseContractType,
  parseRemote,
} from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://jobboard.asfored.org/offres/*'],
  main() {
    injectSaveButton(extract, isOfferVisible);
  },
});

function isOfferVisible() {
  return Boolean(getOfferId() && getOfferRoot());
}

function extract(): JobPostingDraft {
  const root = getOfferRoot();
  const pageText = root?.innerText ?? document.body.innerText;
  const rawCompany = cleanText(root?.querySelector<HTMLElement>('.title h2')?.innerText) ?? '';
  const company = normalizeAsforedCompany(rawCompany);
  const title = cleanText(root?.querySelector<HTMLElement>('.title .jobtitle')?.innerText) ?? '';
  const contractText = cleanText(root?.querySelector<HTMLElement>('.title p:not(.jobtitle)')?.innerText) ?? '';
  const description = cleanText([
    root?.querySelector<HTMLElement>('.description')?.innerText,
    root?.querySelector<HTMLElement>('.company-bar')?.innerText,
  ].filter(Boolean).join('\n\n')) ?? null;
  const location = readDetailValue(root, 'Lieu du poste');
  const keywords = [
    readDetailValue(root, 'Métier'),
    ...readDetailList(root, 'Compétences'),
  ].filter((item): item is string => Boolean(item));

  return {
    url: window.location.href,
    source: 'asfored',
    title,
    company,
    location,
    description,
    contract_type: parseContractType(contractText || pageText),
    remote: parseRemote(pageText),
    salary: null,
    requirements: null,
    keywords: keywords.length ? keywords : null,
    company_website: extractCompanyWebsite(company),
  };
}

function getOfferId() {
  const hash = window.location.hash.replace(/^#!/, '').replace(/^#/, '');
  return new URLSearchParams(hash).get('oe');
}

function getOfferRoot() {
  const offerId = getOfferId();
  const modals = Array.from(document.querySelectorAll<HTMLElement>('.jb-modal.offre'));
  const modal = offerId
    ? modals.find((candidate) => candidate.dataset.oid === offerId)
    : modals[0];

  return modal?.querySelector<HTMLElement>('.offre-content') ?? null;
}

function normalizeAsforedCompany(value: string) {
  return cleanText(value.replace(/\s+-\s+France entière$/i, '')) ?? value;
}

function readDetailValue(root: HTMLElement | null, label: string) {
  if (!root) return null;
  const target = normalizeLabel(label);

  for (const heading of root.querySelectorAll<HTMLElement>('.details h3')) {
    if (normalizeLabel(heading.innerText) !== target) continue;

    const value = heading.nextElementSibling instanceof HTMLElement
      ? cleanText(heading.nextElementSibling.innerText)
      : undefined;

    return value ?? null;
  }

  return null;
}

function readDetailList(root: HTMLElement | null, label: string) {
  if (!root) return [];
  const target = normalizeLabel(label);

  for (const heading of root.querySelectorAll<HTMLElement>('.description h3')) {
    if (normalizeLabel(heading.innerText) !== target) continue;
    const list = heading.nextElementSibling;
    if (!(list instanceof HTMLUListElement)) return [];

    return Array.from(list.querySelectorAll('li'))
      .map((item) => cleanText(item.innerText.replace(/^[]\s*/, '')))
      .filter((item): item is string => Boolean(item));
  }

  return [];
}

function normalizeLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
