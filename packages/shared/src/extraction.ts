import type { ContractType, RemoteType } from './constants.js';

export function parseContractType(raw: string): ContractType | null {
  const r = raw.toLowerCase();
  if (r.includes('cdi')) return 'cdi';
  if (r.includes('cdd')) return 'cdd';
  if (r.includes('alternance') || r.includes('apprentissage')) return 'alternance';
  if (r.includes('stage')) return 'stage';
  if (r.includes('freelance') || r.includes('consultant')) return 'freelance';
  return null;
}

export function parseRemote(raw: string): RemoteType | null {
  const r = raw.toLowerCase();
  if (
    r.includes('télétravail complet') ||
    r.includes('teletravail complet') ||
    r.includes('full remote') ||
    r.includes('remote')
  ) {
    return 'remote';
  }
  if (r.includes('hybride') || r.includes('hybrid')) return 'hybride';
  if (
    r.includes('présentiel') ||
    r.includes('presentiel') ||
    r.includes('sur site') ||
    r.includes('on-site') ||
    r.includes('onsite')
  ) {
    return 'présentiel';
  }
  return null;
}
