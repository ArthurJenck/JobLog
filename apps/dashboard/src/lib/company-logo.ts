import { useEffect, useState } from 'react';
import type { JobPosting } from '@joblog/shared';
import { api } from '@/lib/api';

const LOGO_DEV_TOKEN = import.meta.env.VITE_LOGO_DEV_TOKEN?.trim();

export function getCompanyLogoUrl(
  jobPosting: Pick<JobPosting, 'company_website'> | null | undefined,
  size: number
) {
  if (!jobPosting?.company_website) return null;

  return getLogoUrlForDomain(jobPosting.company_website, size);
}

const companyDomainCache = new Map<string, Promise<string | null>>();

function searchCompanyDomain(company: string) {
  const key = company.trim().toLowerCase();
  if (!key) return Promise.resolve(null);

  let pending = companyDomainCache.get(key);
  if (!pending) {
    pending = api.logos
      .search(company)
      .then((res) => res.data[0]?.domain ?? null)
      .catch(() => null);
    companyDomainCache.set(key, pending);
  }
  return pending;
}

export function useCompanyLogoUrl(
  jobPosting: Pick<JobPosting, 'company_website'> | null | undefined,
  company: string | null | undefined,
  size: number
) {
  const directUrl = getCompanyLogoUrl(jobPosting, size);
  const [fallbackDomain, setFallbackDomain] = useState<string | null>(null);

  useEffect(() => {
    if (directUrl || !company) {
      setFallbackDomain(null);
      return;
    }

    let cancelled = false;
    searchCompanyDomain(company).then((domain) => {
      if (!cancelled) setFallbackDomain(domain);
    });
    return () => {
      cancelled = true;
    };
  }, [directUrl, company]);

  if (directUrl) return directUrl;
  return fallbackDomain ? getLogoUrlForDomain(fallbackDomain, size) : null;
}

export function getLogoUrlForDomain(value: string | null | undefined, size: number) {
  if (!LOGO_DEV_TOKEN) return null;

  const domain = extractHttpDomain(value);
  if (!domain || isJobBoardDomain(domain)) return null;

  const params = new URLSearchParams({
    token: LOGO_DEV_TOKEN,
    size: String(size),
    format: 'png',
    fallback: '404',
  });

  return `https://img.logo.dev/${encodeURIComponent(domain)}?${params.toString()}`;
}

function extractHttpDomain(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const hostname = url.hostname.replace(/^www\./i, '').toLowerCase();
    return hostname.includes('.') ? hostname : null;
  } catch {
    return null;
  }
}

function isJobBoardDomain(domain: string) {
  return [
    'welcometothejungle.com',
    'linkedin.com',
    'hellowork.com',
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
  ].some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}
