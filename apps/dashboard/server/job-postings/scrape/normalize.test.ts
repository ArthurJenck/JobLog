import { describe, expect, test } from 'vitest';
import {
  cleanText,
  detectSource,
  getDisplayDomain,
  normalizeCompanyDomain,
  normalizeContractType,
  normalizeRemote,
  normalizeSalary,
  normalizeStringArray,
  normalizeWhitespace,
} from './normalize.js';

describe('detectSource', () => {
  test('recognizes known boards', () => {
    expect(detectSource('https://www.linkedin.com/jobs/1')).toBe('linkedin');
    expect(detectSource('https://welcometothejungle.com/x')).toBe('wttj');
    expect(detectSource('https://www.glassdoor.fr/job/1')).toBe('glassdoor');
  });
  test('falls back to paste', () => {
    expect(detectSource('https://acme.example/careers')).toBe('paste');
  });
});

describe('getDisplayDomain', () => {
  test('strips www', () => {
    expect(getDisplayDomain('https://www.example.com/a/b')).toBe('example.com');
  });
  test('handles invalid url', () => {
    expect(getDisplayDomain('not a url')).toBe('URL collée');
  });
});

describe('cleanText', () => {
  test('collapses whitespace', () => {
    expect(cleanText('  a   b\n c ')).toBe('a b c');
  });
  test('empty becomes undefined', () => {
    expect(cleanText('   ')).toBeUndefined();
    expect(cleanText(null)).toBeUndefined();
    expect(cleanText(undefined)).toBeUndefined();
  });
});

describe('normalizeWhitespace', () => {
  test('removes carriage returns and collapses spaces/tabs, keeps newlines', () => {
    expect(normalizeWhitespace('a\r\n  b\t c')).toBe('a\n b c');
  });
});

describe('normalizeContractType', () => {
  test('accepts canonical value directly', () => {
    expect(normalizeContractType('cdi', '')).toBe('cdi');
  });
  test('parses from fallback text', () => {
    expect(normalizeContractType(null, 'poste en CDD')).toBe('cdd');
  });
  test('returns null when nothing matches', () => {
    expect(normalizeContractType(undefined, '')).toBeNull();
  });
});

describe('normalizeRemote', () => {
  test('accepts canonical value directly', () => {
    expect(normalizeRemote('remote', '')).toBe('remote');
  });
  test('maps english variant via parser', () => {
    expect(normalizeRemote('hybrid', '')).toBe('hybride');
  });
  test('parses from fallback text', () => {
    expect(normalizeRemote(null, 'travail sur site')).toBe('présentiel');
  });
});

describe('normalizeSalary', () => {
  test('null input', () => {
    expect(normalizeSalary(null)).toBeNull();
  });
  test('keeps valid fields', () => {
    expect(normalizeSalary({ min: 30000, max: null, currency: 'EUR', period: 'year' })).toEqual({
      min: 30000,
      max: null,
      currency: 'EUR',
      period: 'year',
    });
  });
  test('all-empty becomes null', () => {
    expect(normalizeSalary({ min: null, max: null, currency: null, period: null })).toBeNull();
  });
});

describe('normalizeStringArray', () => {
  test('dedupes and trims', () => {
    expect(normalizeStringArray(['a', 'a', ' b '])).toEqual(['a', 'b']);
  });
  test('empty and non-array become null', () => {
    expect(normalizeStringArray([])).toBeNull();
    expect(normalizeStringArray(['  ', ''])).toBeNull();
    expect(normalizeStringArray(null)).toBeNull();
  });
});

describe('normalizeCompanyDomain', () => {
  test('extracts bare domain', () => {
    expect(normalizeCompanyDomain('https://www.acme.com/about')).toBe('acme.com');
    expect(normalizeCompanyDomain('acme.io')).toBe('acme.io');
  });
  test('rejects ignored job boards', () => {
    expect(normalizeCompanyDomain('https://linkedin.com/company/acme')).toBeNull();
  });
  test('rejects non-domains and empty', () => {
    expect(normalizeCompanyDomain('notadomain')).toBeNull();
    expect(normalizeCompanyDomain('')).toBeNull();
  });
});
