import {
  CONTRACT_TYPES,
  REMOTE_TYPES,
  type ContractType,
  type JobSource,
  type RemoteType,
  parseContractType,
  parseRemote,
} from '@joblog/shared';
import { isBlockedOrErrorContent } from './content-filters.js';
import type { GeminiExtraction } from './gemini-extract.js';

const MAX_DESCRIPTION_CHARS = 10_000;

export type NormalizedExtraction = {
  title: string;
  company: string;
  location: string | null;
  description: string | null;
  contract_type: ContractType | null;
  remote: RemoteType | null;
  salary: {
    min: number | null;
    max: number | null;
    currency: string | null;
    period: 'month' | 'year' | null;
  } | null;
  requirements: string[] | null;
  keywords: string[] | null;
  company_website: string | null;
};

export function cleanText(value?: string | null) {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}

export function detectSource(url: string): JobSource {
  if (url.includes('linkedin.com')) return 'linkedin';
  if (url.includes('welcometothejungle.com')) return 'wttj';
  if (url.includes('hellowork.com')) return 'hellowork';
  if (url.includes('indeed.com')) return 'indeed';
  if (url.includes('glassdoor.')) return 'glassdoor';
  if (url.includes('jobteaser.com')) return 'jobteaser';
  if (url.includes('jobijoba.com')) return 'jobijoba';
  if (url.includes('meteojob.com')) return 'meteojob';
  if (url.includes('apec.fr')) return 'apec';
  if (url.includes('francetravail.fr')) return 'francetravail';
  if (url.includes('cadremploi.fr')) return 'cadremploi';
  if (url.includes('talent.com')) return 'talent';
  if (url.includes('lesjeudis.com')) return 'lesjeudis';
  return 'paste';
}

export function getDisplayDomain(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, '');
  } catch {
    return 'URL collée';
  }
}

export function normalizeContractType(value: string | null | undefined, fallback: string) {
  if (value && (CONTRACT_TYPES as readonly string[]).includes(value)) {
    return value as ContractType;
  }
  return parseContractType([value, fallback].filter(Boolean).join(' '));
}

export function normalizeRemote(value: string | null | undefined, fallback: string) {
  if (value && (REMOTE_TYPES as readonly string[]).includes(value)) {
    return value as RemoteType;
  }
  return parseRemote([value, fallback].filter(Boolean).join(' '));
}

export function normalizeSalary(value: GeminiExtraction['salary']) {
  if (!value || typeof value !== 'object') return null;
  const min = typeof value.min === 'number' && Number.isFinite(value.min) ? value.min : null;
  const max = typeof value.max === 'number' && Number.isFinite(value.max) ? value.max : null;
  const currency = cleanText(value.currency) ?? null;
  const period = value.period === 'month' || value.period === 'year' ? value.period : null;
  if (min === null && max === null && !currency && !period) return null;
  return { min, max, currency, period };
}

export function normalizeStringArray(value: string[] | null | undefined) {
  if (!Array.isArray(value)) return null;
  const items = [...new Set(value.map((item) => cleanText(item)).filter(Boolean) as string[])]
    .slice(0, 12);
  return items.length ? items : null;
}

export function normalizeCompanyDomain(raw: string) {
  const value = cleanText(raw);
  if (!value) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const domain = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (!domain.includes('.')) return null;
    if (isIgnoredCompanyDomain(domain)) return null;
    return domain;
  } catch {
    return null;
  }
}

function isIgnoredCompanyDomain(domain: string) {
  return [
    'welcometothejungle.com',
    'linkedin.com',
    'hellowork.com',
    'jobijoba.com',
    'indeed.com',
    'glassdoor.com',
    'jobteaser.com',
    'greenhouse.io',
    'lever.co',
    'workable.com',
    'ashbyhq.com',
    'smartrecruiters.com',
    'recruitee.com',
    'teamtailor.com',
    'breezy.hr',
    'personio.com',
    'successfactors.com',
    'myworkdayjobs.com',
    'workdayjobs.com',
    'icims.com',
    'facebook.com',
    'instagram.com',
    'x.com',
    'twitter.com',
    'youtube.com',
    'tiktok.com',
  ].some((ignored) => domain === ignored || domain.endsWith(`.${ignored}`));
}

export function normalizeGeminiExtraction(
  raw: GeminiExtraction,
  markdown: string,
): NormalizedExtraction | null {
  if (raw.readable === false) return null;

  const title = cleanText(raw.title);
  const company = cleanText(raw.company);
  if (!title || !company) return null;

  const searchableText = [
    raw.contract_type,
    raw.remote,
    raw.description,
    markdown.slice(0, 5000),
  ].filter(Boolean).join(' ');

  const contract_type = normalizeContractType(raw.contract_type, searchableText);
  const remote = normalizeRemote(raw.remote, searchableText);
  const description = cleanText(raw.description)?.slice(0, MAX_DESCRIPTION_CHARS) ??
    markdown.slice(0, MAX_DESCRIPTION_CHARS);

  if (isBlockedOrErrorContent({ title, company, content: description, status: null })) {
    return null;
  }

  return {
    title,
    company,
    location: cleanText(raw.location) ?? null,
    description,
    contract_type,
    remote,
    salary: normalizeSalary(raw.salary),
    requirements: normalizeStringArray(raw.requirements),
    keywords: normalizeStringArray(raw.keywords),
    company_website: normalizeCompanyDomain(raw.company_website ?? ''),
  };
}
