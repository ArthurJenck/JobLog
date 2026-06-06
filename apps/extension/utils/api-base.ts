const PRODUCTION_API_BASE = 'https://joblog.arthurjenck.com';

export const API_BASE = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL ?? PRODUCTION_API_BASE)
  : PRODUCTION_API_BASE;
