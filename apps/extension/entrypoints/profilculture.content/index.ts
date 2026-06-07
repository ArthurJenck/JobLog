import type { JobPostingDraft } from '@joblog/shared';
import {
  cleanText,
  extractCompanyWebsite,
  injectSaveButton,
  parseContractType,
  parseRemote,
} from '../../utils/content-script';

export default defineContentScript({
  matches: ['https://www.profilculture.com/annonce/*.html'],
  main() {
    injectSaveButton(extract, isJobPage);
  },
});

function isJobPage() {
  return Boolean(document.querySelector('.offre_zone.offre_details'));
}

function extract(): JobPostingDraft {
  const root = document.querySelector<HTMLElement>('.offre_zone.offre_details');
  const pageText = root?.innerText ?? document.body.innerText;
  const title = cleanText(root?.querySelector<HTMLElement>('.left_offre h4')?.innerText) ?? '';
  const company =
    cleanText(root?.querySelector<HTMLElement>('.left_offre p')?.innerText) ??
    '';
  const contractText = cleanText(root?.querySelector<HTMLElement>('.right_offre .offre_contrat')?.innerText) ?? pageText;
  const description = cleanText([
    readDetailsItem(root, "Description de l'entreprise/de l'organisme"),
    readDetailsItem(root, 'Description du poste'),
    readDetailsItem(root, 'Description du profil recherché'),
    readDetailsItem(root, "Description de l'expérience recherchée"),
  ].filter(Boolean).join('\n\n')) ?? null;
  const location =
    readDetailsItem(root, 'Lieu') ??
    cleanText(root?.querySelector<HTMLElement>('.left_offre .fa-location-dot')?.parentElement?.innerText) ??
    null;
  const companyWebsite =
    getDetailsItemLinkDomain(root, "Site web de l'entreprise/de l'organisme") ??
    extractCompanyWebsite(company);

  return {
    url: window.location.href,
    source: 'profilculture',
    title,
    company,
    location,
    description,
    contract_type: parseContractType(contractText),
    remote: parseRemote(pageText),
    salary: null,
    requirements: null,
    keywords: null,
    company_website: companyWebsite,
  };
}

function readDetailsItem(root: HTMLElement | null, label: string) {
  const item = findDetailsItem(root, label);
  if (!item) return null;

  const clone = item.cloneNode(true) as HTMLElement;
  clone.querySelector('h3')?.remove();
  return cleanText(clone.innerText) ?? null;
}

function getDetailsItemLinkDomain(root: HTMLElement | null, label: string) {
  const href = findDetailsItem(root, label)?.querySelector<HTMLAnchorElement>('a[href]')?.href;
  if (!href) return null;

  try {
    const url = new URL(href, window.location.href);
    const domain = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (!domain.includes('.')) return null;
    if (domain === window.location.hostname.replace(/^www\./i, '').toLowerCase()) return null;
    return domain;
  } catch {
    return null;
  }
}

function findDetailsItem(root: HTMLElement | null, label: string) {
  if (!root) return null;
  const target = normalizeLabel(label);

  return Array.from(root.querySelectorAll<HTMLElement>('.offre_details_item'))
    .find((item) => normalizeLabel(item.querySelector('h3')?.innerText ?? '') === target) ?? null;
}

function normalizeLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
