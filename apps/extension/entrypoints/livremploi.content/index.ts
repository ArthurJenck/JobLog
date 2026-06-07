import type { JobPostingDraft, RemoteType } from '@joblog/shared';
import {
  cleanText,
  extractCompanyWebsite,
  extractStructuredJobPosting,
  injectSaveButton,
  parseContractType,
  parseRemote,
} from '../../utils/content-script';

type JsonRecord = Record<string, unknown>;

export default defineContentScript({
  matches: ['https://www.livremploi.fr/offre/*', 'https://livremploi.fr/offre/*'],
  main() {
    injectSaveButton(extract);
  },
});

function extract(): JobPostingDraft {
  const structured = extractStructuredJobPosting();
  const offer = getInertiaOffer();
  const pageText = document.body.innerText;
  const title =
    readString(offer, ['title', 'name', 'job_title', 'position', 'label']) ??
    cleanText(document.querySelector<HTMLElement>('h1, [class*="job-title"], [class*="offer-title"]')?.innerText) ??
    structured.title ??
    '';
  const company =
    readString(offer, ['company.name', 'company_name', 'employer.name', 'employer_name', 'recruiter.name', 'recruiter_name']) ??
    structured.company ??
    cleanText(document.querySelector<HTMLElement>('[class*="company"], [class*="employer"], [class*="recruiter"]')?.innerText) ??
    '';
  const description =
    readJoinedStrings(offer, ['company_description', 'job_description', 'profile_description']) ??
    readString(offer, ['description', 'content', 'body', 'missions', 'profile']) ??
    structured.description ??
    cleanText(document.querySelector<HTMLElement>('[class*="description"], [class*="content"], article')?.innerText) ??
    null;
  const location =
    getLivremploiLocation(offer) ??
    readString(offer, ['location', 'city.name', 'city', 'place', 'address', 'region.name']) ??
    structured.location ??
    cleanText(document.querySelector<HTMLElement>('[class*="location"], [class*="city"], [class*="place"]')?.innerText) ??
    null;
  const contractText =
    readString(offer, ['contract_type.name', 'contract.name', 'contract_type', 'contract', 'job_duration']) ??
    pageText;
  const teleworkText = readString(offer, ['telework_policy.name', 'telework_policy']) ?? '';
  const companyWebsite =
    normalizeDomain(readString(offer, ['company.website', 'company.url', 'employer.website', 'website', 'url'])) ??
    normalizeDomain(readString(offer, ['company_website'])) ??
    extractCompanyWebsite(company);

  return {
    url: window.location.href,
    source: 'livremploi',
    title,
    company,
    location,
    description,
    contract_type: parseContractType(contractText),
    remote: parseLivremploiRemote(teleworkText) ?? parseRemote(pageText),
    salary: null,
    requirements: null,
    keywords: getLivremploiKeywords(offer) ?? structured.keywords ?? null,
    company_website: companyWebsite,
  };
}

function getInertiaOffer() {
  const raw = document.getElementById('app')?.getAttribute('data-page');
  if (!raw) return null;

  try {
    const page = JSON.parse(raw) as { props?: JsonRecord };
    const props = page.props;
    if (!props) return null;

    for (const key of ['offer', 'job', 'currentOffer', 'jobOffer']) {
      const value = props[key];
      if (isRecord(value)) return value;
    }
  } catch {
    return null;
  }

  return null;
}

function readString(record: JsonRecord | null, paths: string[]) {
  if (!record) return undefined;

  for (const path of paths) {
    const value = readPath(record, path);
    const text = htmlToText(value);
    if (text) return text;
  }

  return undefined;
}

function readJoinedStrings(record: JsonRecord | null, paths: string[]) {
  if (!record) return undefined;

  const parts = paths
    .map((path) => htmlToText(readPath(record, path)))
    .filter(Boolean);

  return cleanText(parts.join('\n\n'));
}

function getLivremploiLocation(offer: JsonRecord | null) {
  if (!offer) return undefined;

  const city = readString(offer, ['city.name']);
  const postcode = readString(offer, ['city.postcode']);
  return cleanText([postcode, city].filter(Boolean).join(' '));
}

function parseLivremploiRemote(value: string): RemoteType | null {
  const parsed = parseRemote(value);
  if (parsed) return parsed;

  const normalized = normalizeText(value);
  if (normalized.includes('teletravail partiel')) return 'hybride';
  if (normalized.includes('teletravail total')) return 'remote';
  if (normalized.includes('pas de teletravail') || normalized.includes('sans teletravail')) return 'présentiel';
  return null;
}

function getLivremploiKeywords(offer: JsonRecord | null) {
  const keywords = [
    readString(offer, ['business_sector.name']),
    readString(offer, ['other_business_sector']),
  ].filter((keyword): keyword is string => Boolean(keyword));

  return keywords.length ? keywords : null;
}

function readPath(record: JsonRecord, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (!isRecord(value)) return undefined;
    return value[key];
  }, record);
}

function htmlToText(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const template = document.createElement('template');
  template.innerHTML = value;
  return cleanText(template.content.textContent ?? value);
}

function normalizeDomain(raw?: string) {
  if (!raw) return null;

  try {
    const url = new URL(raw, window.location.href);
    const domain = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (!domain.includes('.')) return null;
    if (domain === window.location.hostname.replace(/^www\./i, '').toLowerCase()) return null;
    return domain;
  } catch {
    return null;
  }
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
