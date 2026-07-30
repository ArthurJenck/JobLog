import { describe, expect, test } from 'vitest';
import {
  blockedScrapeMessage,
  isBlockedOrErrorContent,
  isBlockedOrErrorJobPosting,
  looksLikeCaptchaChallenge,
  unreadableUrlMessage,
} from './content-filters.js';

describe('isBlockedOrErrorContent', () => {
  test('flags http error status', () => {
    expect(isBlockedOrErrorContent({ title: '', company: '', content: 'ok', status: 403 })).toBe(true);
  });
  test('flags 403 error title', () => {
    expect(isBlockedOrErrorContent({ title: '403 error', company: '', content: '', status: null })).toBe(true);
  });
  test('flags access denied and robot checks', () => {
    expect(isBlockedOrErrorContent({ title: '', company: '', content: 'Access Denied', status: null })).toBe(true);
    expect(isBlockedOrErrorContent({ title: '', company: '', content: 'you are not a robot', status: null })).toBe(true);
  });
  test('flags captcha challenge', () => {
    expect(isBlockedOrErrorContent({ title: '', company: '', content: 'please solve the captcha to continue', status: null })).toBe(true);
  });
  test('accepts valid content', () => {
    expect(isBlockedOrErrorContent({ title: 'Dev', company: 'Acme', content: 'Great job offer', status: 200 })).toBe(false);
  });
});

describe('looksLikeCaptchaChallenge', () => {
  test('cookie panel mention of recaptcha is not a challenge', () => {
    expect(looksLikeCaptchaChallenge('gestion des cookies - recaptcha services tiers')).toBe(false);
  });
  test('real challenge is detected', () => {
    expect(looksLikeCaptchaChallenge('captcha verification required')).toBe(true);
    expect(looksLikeCaptchaChallenge('unusual traffic detected, recaptcha')).toBe(true);
  });
  test('no captcha keyword returns false', () => {
    expect(looksLikeCaptchaChallenge('a normal page')).toBe(false);
  });
});

describe('isBlockedOrErrorJobPosting', () => {
  test('flags 403 error title', () => {
    expect(isBlockedOrErrorJobPosting({ title: '403 Error' })).toBe(true);
  });
  test('flags partial 403 title without company', () => {
    expect(isBlockedOrErrorJobPosting({ title: 'oops 403 error page', company: '' })).toBe(true);
  });
  test('does not flag partial 403 title with company', () => {
    expect(isBlockedOrErrorJobPosting({ title: 'oops 403 error page', company: 'Acme' })).toBe(false);
  });
  test('flags robot / js-disabled descriptions', () => {
    expect(isBlockedOrErrorJobPosting({ description: 'prove you are not a robot' })).toBe(true);
    expect(isBlockedOrErrorJobPosting({ description: 'JavaScript is disabled' })).toBe(true);
  });
  test('accepts valid posting', () => {
    expect(isBlockedOrErrorJobPosting({ title: 'Dev', company: 'Acme', description: 'join us' })).toBe(false);
  });
});

describe('messages', () => {
  test('blockedScrapeMessage picks site-specific copy', () => {
    expect(blockedScrapeMessage('https://linkedin.com/jobs/1')).toContain('LinkedIn');
    expect(blockedScrapeMessage('https://example.com/x')).toContain('récupération automatique');
  });
  test('unreadableUrlMessage picks site-specific copy', () => {
    expect(unreadableUrlMessage('https://linkedin.com/jobs/1')).toContain('LinkedIn');
    expect(unreadableUrlMessage('https://example.com/x')).toContain('Impossible de lire');
  });
});
