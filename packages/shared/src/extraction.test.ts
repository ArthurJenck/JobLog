import { describe, expect, it } from 'vitest';
import { parseContractType, parseRemote } from './extraction.js';

describe('parseContractType', () => {
  it('detects known contract types regardless of case', () => {
    expect(parseContractType('CDI')).toBe('cdi');
    expect(parseContractType('Contrat CDD de 6 mois')).toBe('cdd');
    expect(parseContractType('Alternance / apprentissage')).toBe('alternance');
    expect(parseContractType('Stage de fin d\'études')).toBe('stage');
    expect(parseContractType('Mission freelance')).toBe('freelance');
  });

  it('matches apprentissage as alternance', () => {
    expect(parseContractType('Contrat d\'apprentissage')).toBe('alternance');
  });

  it('matches consultant as freelance', () => {
    expect(parseContractType('Poste de consultant indépendant')).toBe('freelance');
  });

  it('returns null when nothing matches', () => {
    expect(parseContractType('Bénévolat')).toBeNull();
    expect(parseContractType('')).toBeNull();
  });
});

describe('parseRemote', () => {
  it('detects full remote in French and English', () => {
    expect(parseRemote('Télétravail complet')).toBe('remote');
    expect(parseRemote('Teletravail complet')).toBe('remote');
    expect(parseRemote('Full remote')).toBe('remote');
    expect(parseRemote('100% remote')).toBe('remote');
  });

  it('detects hybrid in French and English', () => {
    expect(parseRemote('Travail hybride')).toBe('hybride');
    expect(parseRemote('Hybrid role')).toBe('hybride');
  });

  it('detects on-site variants', () => {
    expect(parseRemote('Présentiel')).toBe('présentiel');
    expect(parseRemote('Presentiel uniquement')).toBe('présentiel');
    expect(parseRemote('Sur site')).toBe('présentiel');
    expect(parseRemote('On-site position')).toBe('présentiel');
    expect(parseRemote('Onsite')).toBe('présentiel');
  });

  it('prioritizes remote over on-site when both keywords appear', () => {
    expect(parseRemote('Télétravail complet, présentiel possible')).toBe('remote');
  });

  it('returns null when nothing matches', () => {
    expect(parseRemote('Non précisé')).toBeNull();
    expect(parseRemote('')).toBeNull();
  });
});
