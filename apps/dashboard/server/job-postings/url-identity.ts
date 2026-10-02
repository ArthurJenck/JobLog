import { randomUUID } from 'node:crypto';
import type { JobSource } from '@joblog/shared';
import { sha256 } from '../../lib/hash.js';
import { detectSource } from './scrape/normalize.js';

const TRACKING_PARAMETERS = new Set([
  'fbclid',
  'gclid',
  'msclkid',
  'ref',
  'refid',
  'source',
  'trk',
  'trackingid',
]);

type ListRule = (url: URL) => boolean;

const LIST_RULES: Partial<Record<JobSource, ListRule>> = {
  glassdoor: (url) => {
    if (extractNativeJobId(url, 'glassdoor')) return false;
    if (/\/job-listing\//i.test(url.pathname)) return false;
    return /SRCH_/i.test(url.pathname) || /^\/(emploi|jobs?)\/?$/i.test(url.pathname);
  },
  linkedin: (url) => {
    if (extractNativeJobId(url, 'linkedin')) return false;
    return /^\/jobs\/(search|collections)/i.test(url.pathname);
  },
  indeed: (url) => {
    if (extractNativeJobId(url, 'indeed')) return false;
    return /^\/(jobs|emplois)\/?$/i.test(url.pathname);
  },
  wttj: (url) => /\/jobs\/?$/i.test(url.pathname),
  hellowork: (url) => /\/emplois?\/recherche/i.test(url.pathname),
};

export interface JobPostingIdentityInput {
  url: string;
  canonicalUrl?: string | null;
  source?: JobSource;
  sourceKey?: string | null;
  nativeJobId?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
}

export interface JobPostingIdentity {
  canonicalUrl: string;
  dedupKey: string;
  identity: string;
  kind: 'native' | 'url' | 'panel' | 'manual';
  nativeJobId: string | null;
  source: JobSource;
  sourceKey: string;
}

export function isJobListUrl(rawUrl: string) {
  const url = parseUrl(rawUrl);
  if (!url) return false;
  const rule = LIST_RULES[detectSource(rawUrl)];
  return rule ? rule(url) : false;
}

export function isSupportedJobUrl(rawUrl: string) {
  const protocol = parseUrl(rawUrl)?.protocol;
  return protocol === 'https:' || protocol === 'http:' || protocol === 'manual:';
}

export function normalizeJobUrl(rawUrl: string, source = detectSource(rawUrl)) {
  const url = parseUrl(rawUrl);
  if (!url) return rawUrl.trim();

  url.username = '';
  url.password = '';
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();

  const nativeJobId = extractNativeJobId(url, source);
  if (nativeJobId) {
    const nativeUrl = buildNativeJobUrl(url, source, nativeJobId);
    if (nativeUrl) return nativeUrl;
  }

  const parameters = [...url.searchParams.entries()]
    .filter(([key]) => !isTrackingParameter(key))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    );
  url.search = '';
  for (const [key, value] of parameters) url.searchParams.append(key, value);

  url.pathname = normalizePathname(url.pathname);
  return url.toString();
}

export function resolveJobPostingIdentity(input: JobPostingIdentityInput): JobPostingIdentity {
  const source = input.source ?? (input.sourceKey ? 'custom' : detectSource(input.url));
  const sourceKey = normalizeSourceKey(input.sourceKey || source || hostnameSourceKey(input.url));
  const parsedUrl = parseUrl(input.url);
  if (!parsedUrl || !isSupportedJobUrl(input.url)) throw new Error('Unsupported job URL');

  if (parsedUrl?.protocol === 'manual:') {
    const manualId = parsedUrl.pathname.replace(/^\/+/, '') || parsedUrl.hostname || randomUUID();
    const canonicalUrl = `manual://joblog/${manualId}`;
    return buildIdentityResult(`manual:${manualId}`, canonicalUrl, source, sourceKey, null, 'manual');
  }

  const nativeJobId = normalizeNativeJobId(
    input.nativeJobId ?? (parsedUrl ? extractNativeJobId(parsedUrl, source) : null),
  );
  let canonicalUrl = normalizeJobUrl(input.canonicalUrl ?? input.url, source);

  if (nativeJobId) {
    const canonicalBase = parseUrl(input.canonicalUrl ?? input.url) ?? parsedUrl;
    canonicalUrl = canonicalBase
      ? buildNativeJobUrl(canonicalBase, source, nativeJobId) ?? canonicalUrl
      : canonicalUrl;
    return buildIdentityResult(
      `native:${sourceKey}:${nativeJobId}`,
      canonicalUrl,
      source,
      sourceKey,
      nativeJobId,
      'native',
    );
  }

  if (isJobListUrl(input.url)) {
    const panelParts = [input.title, input.company, input.location].map(normalizeIdentityPart);
    if (!panelParts[0] || !panelParts[1]) {
      throw new Error('A panel identity requires a title and company');
    }
    return buildIdentityResult(
      `panel:${sourceKey}:${canonicalUrl}:${panelParts.join(':')}`,
      canonicalUrl,
      source,
      sourceKey,
      null,
      'panel',
    );
  }

  return buildIdentityResult(`url:${canonicalUrl}`, canonicalUrl, source, sourceKey, null, 'url');
}

export const canonicalizeJobUrl = normalizeJobUrl;
export const identifyJobPosting = resolveJobPostingIdentity;

export function createManualJobUrl() {
  return `manual://joblog/${randomUUID()}`;
}

export function buildJobPostingKey(input: JobPostingIdentityInput) {
  return resolveJobPostingIdentity(input).identity;
}

export function extractNativeJobId(url: URL, source: JobSource): string | null {
  if (source === 'linkedin') {
    return normalizeNativeJobId(
      url.pathname.match(/\/jobs\/view\/(\d+)/i)?.[1] ?? url.searchParams.get('currentJobId'),
    );
  }

  if (source === 'indeed') {
    return normalizeNativeJobId(url.searchParams.get('jk') ?? url.searchParams.get('vjk'));
  }

  if (source === 'glassdoor') {
    return normalizeNativeJobId(
      url.searchParams.get('jl') ?? url.searchParams.get('jobListingId'),
    );
  }

  if (source === 'hellowork') {
    return normalizeNativeJobId(url.pathname.match(/\/emplois\/(\d+)\.html/i)?.[1]);
  }

  if (source === 'wttj') {
    const match = url.pathname.match(/\/companies\/([^/]+)\/jobs\/([^/?#]+)/i);
    return normalizeNativeJobId(match ? `${match[1]}/${match[2]}` : null);
  }

  return null;
}

function buildIdentityResult(
  identity: string,
  canonicalUrl: string,
  source: JobSource,
  sourceKey: string,
  nativeJobId: string | null,
  kind: JobPostingIdentity['kind'],
): JobPostingIdentity {
  return {
    canonicalUrl,
    dedupKey: sha256(`job:v2\0${identity}`),
    identity,
    kind,
    nativeJobId,
    source,
    sourceKey,
  };
}

function buildNativeJobUrl(url: URL, source: JobSource, nativeJobId: string) {
  if (source === 'linkedin') return `https://www.linkedin.com/jobs/view/${nativeJobId}/`;
  if (source === 'indeed') return `https://${url.hostname}/viewjob?jk=${encodeURIComponent(nativeJobId)}`;
  if (source === 'glassdoor') return `https://${url.hostname}/job-listing/?jl=${encodeURIComponent(nativeJobId)}`;
  return null;
}

function isTrackingParameter(key: string) {
  const normalized = key.toLowerCase();
  return normalized.startsWith('utm_') || TRACKING_PARAMETERS.has(normalized);
}

function normalizeIdentityPart(value: string | null | undefined) {
  return value?.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr') ?? '';
}

function normalizeNativeJobId(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizePathname(pathname: string) {
  const normalized = pathname.replace(/\/{2,}/g, '/');
  if (normalized === '/') return '/';
  return `${normalized.replace(/\/+$/, '')}/`;
}

function normalizeSourceKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

function hostnameSourceKey(rawUrl: string) {
  return parseUrl(rawUrl)?.hostname.replace(/^www\./, '') ?? 'unknown';
}

function parseUrl(rawUrl: string) {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}
