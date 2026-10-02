import { describe, expect, it } from 'vitest';
import {
  getGlassdoorListingIdFromUrl,
  getIndeedJobKeyFromUrl,
  getLinkedInJobIdFromUrl,
} from './job-identities';

describe('jobboard native identities', () => {
  it('reads the LinkedIn direct job path and selected search parameter', () => {
    expect(getLinkedInJobIdFromUrl('https://www.linkedin.com/jobs/view/4438177658/'))
      .toBe('4438177658');
    expect(getLinkedInJobIdFromUrl('https://fr.linkedin.com/jobs/search/?currentJobId=4438177658'))
      .toBe('4438177658');
  });

  it('uses the Indeed jk and vjk variants as the same native identity', () => {
    expect(getIndeedJobKeyFromUrl('https://fr.indeed.com/viewjob?jk=abc123&utm_source=test'))
      .toBe('abc123');
    expect(getIndeedJobKeyFromUrl('https://fr.indeed.com/jobs?q=designer&vjk=abc123'))
      .toBe('abc123');
  });

  it('uses both Glassdoor listing parameter variants', () => {
    expect(getGlassdoorListingIdFromUrl('https://www.glassdoor.fr/job-listing/example?jl=10001'))
      .toBe('10001');
    expect(getGlassdoorListingIdFromUrl('https://www.glassdoor.com/Jobs/example?jobListingId=10001'))
      .toBe('10001');
  });

  it('returns null for unrelated or invalid URLs', () => {
    expect(getLinkedInJobIdFromUrl('https://www.linkedin.com/jobs/search/')).toBeNull();
    expect(getIndeedJobKeyFromUrl('not-a-url')).toBeNull();
    expect(getGlassdoorListingIdFromUrl('https://www.glassdoor.com/Jobs/index.htm')).toBeNull();
  });
});
