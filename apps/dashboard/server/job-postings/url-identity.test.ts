import { describe, expect, test } from 'vitest';
import { sha256 } from '../../lib/hash.js';
import {
  buildJobPostingKey,
  canonicalizeJobUrl,
  identifyJobPosting,
  isJobListUrl,
  isSupportedJobUrl,
} from './url-identity.js';

const GLASSDOOR_LIST_URL =
  'https://www.glassdoor.fr/Emploi/paris-developpeur-web-emplois-SRCH_IL.0,5_IC2881970_KO6,21.htm?sortBy=date_desc&utm_source=test';

describe('isJobListUrl', () => {
  test('distinguishes list pages from selected offers', () => {
    expect(isJobListUrl(GLASSDOOR_LIST_URL)).toBe(true);
    expect(isJobListUrl(`${GLASSDOOR_LIST_URL}&jl=1010062906489`)).toBe(false);
    expect(isJobListUrl('https://www.linkedin.com/jobs/search/?keywords=react')).toBe(true);
    expect(
      isJobListUrl('https://www.linkedin.com/jobs/search/?currentJobId=4012345678'),
    ).toBe(false);
    expect(isJobListUrl('https://fr.indeed.com/emplois?q=react')).toBe(true);
    expect(isJobListUrl('https://fr.indeed.com/emplois?q=react&vjk=abc123')).toBe(false);
    expect(isJobListUrl('https://www.welcometothejungle.com/fr/jobs?query=react')).toBe(true);
    expect(isJobListUrl('https://www.hellowork.com/fr-fr/emploi/recherche.html?k=react')).toBe(true);
  });
});

describe('isSupportedJobUrl', () => {
  test('allows web and manual URLs only', () => {
    expect(isSupportedJobUrl('https://example.com/jobs/42')).toBe(true);
    expect(isSupportedJobUrl('manual://joblog/one')).toBe(true);
    expect(isSupportedJobUrl('ftp://example.com/jobs/42')).toBe(false);
  });
});

describe('canonicalizeJobUrl', () => {
  test('removes tracking, fragments and sorts retained parameters', () => {
    expect(
      canonicalizeJobUrl('https://EXAMPLE.com:443/jobs/42?utm_source=x&b=2&a=1#apply'),
    ).toBe('https://example.com/jobs/42/?a=1&b=2');
  });

  test('canonicalizes native jobboard identities', () => {
    expect(
      canonicalizeJobUrl('https://fr.linkedin.com/jobs/search/?currentJobId=4438177658&utm_source=x'),
    ).toBe('https://www.linkedin.com/jobs/view/4438177658/');
    expect(canonicalizeJobUrl('https://fr.indeed.com/jobs?vjk=abc123&utm_campaign=x')).toBe(
      'https://fr.indeed.com/viewjob?jk=abc123',
    );
    expect(canonicalizeJobUrl(`${GLASSDOOR_LIST_URL}&jl=1010062906489`)).toBe(
      'https://www.glassdoor.fr/job-listing/?jl=1010062906489',
    );
  });
});

describe('identifyJobPosting', () => {
  test('uses the same key for direct and panel LinkedIn URLs', () => {
    const direct = identifyJobPosting({
      url: 'https://www.linkedin.com/jobs/view/4438177658/?trackingId=x',
    });
    const panel = identifyJobPosting({
      url: 'https://www.linkedin.com/jobs/search/?currentJobId=4438177658',
    });
    expect(panel.dedupKey).toBe(direct.dedupKey);
    expect(panel.kind).toBe('native');
  });

  test('uses jk and vjk as the same Indeed identity', () => {
    const jk = identifyJobPosting({ url: 'https://fr.indeed.com/viewjob?jk=abc123' });
    const vjk = identifyJobPosting({ url: 'https://fr.indeed.com/jobs?vjk=abc123' });
    expect(vjk.dedupKey).toBe(jk.dedupKey);
  });

  test('separates two Glassdoor panels and merges tracking variants', () => {
    const first = identifyJobPosting({ url: `${GLASSDOOR_LIST_URL}&jl=1001` });
    const second = identifyJobPosting({ url: `${GLASSDOOR_LIST_URL}&jl=1002` });
    const firstVariant = identifyJobPosting({
      url: 'https://www.glassdoor.fr/emploi?jobListingId=1001&utm_medium=email',
    });
    expect(first.dedupKey).not.toBe(second.dedupKey);
    expect(firstVariant.dedupKey).toBe(first.dedupKey);
  });

  test('builds a canonical deep URL from an explicitly extracted native id', () => {
    const result = identifyJobPosting({
      url: GLASSDOOR_LIST_URL,
      source: 'glassdoor',
      nativeJobId: '1001',
      title: 'Developer',
      company: 'Acme',
    });
    expect(result.canonicalUrl).toBe('https://www.glassdoor.fr/job-listing/?jl=1001');
    expect(result.kind).toBe('native');
  });

  test('falls back to normalized panel fields without merging different offers', () => {
    const first = identifyJobPosting({
      url: GLASSDOOR_LIST_URL,
      title: '  Développeur   Web ',
      company: 'ACME',
      location: 'Paris',
    });
    const same = identifyJobPosting({
      url: GLASSDOOR_LIST_URL,
      title: 'développeur web',
      company: 'acme',
      location: 'PARIS',
    });
    const other = identifyJobPosting({
      url: GLASSDOOR_LIST_URL,
      title: 'Développeur front',
      company: 'Acme',
      location: 'Paris',
    });
    expect(first.dedupKey).toBe(same.dedupKey);
    expect(first.dedupKey).not.toBe(other.dedupKey);
  });

  test('supports stable custom source keys', () => {
    const result = identifyJobPosting({
      url: 'https://jobs.acme.test/offers/42',
      sourceKey: 'acme-careers',
      nativeJobId: '42',
    });
    expect(result.source).toBe('custom');
    expect(result.identity).toBe('native:acme-careers:42');
    expect(result.dedupKey).toBe(sha256('job:v2\0native:acme-careers:42'));
  });

  test('keeps manual identifiers unique and stable', () => {
    const first = identifyJobPosting({ url: 'manual://joblog/one', source: 'manual' });
    const same = identifyJobPosting({ url: 'manual://joblog/one', source: 'manual' });
    const other = identifyJobPosting({ url: 'manual://joblog/two', source: 'manual' });
    expect(first.dedupKey).toBe(same.dedupKey);
    expect(first.dedupKey).not.toBe(other.dedupKey);
  });
});

describe('buildJobPostingKey', () => {
  test('returns the unhashed v2 identity', () => {
    expect(buildJobPostingKey({ url: 'https://example.com/jobs/42' })).toBe(
      'url:https://example.com/jobs/42/',
    );
  });
});
