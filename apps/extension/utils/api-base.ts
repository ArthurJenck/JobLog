const PRODUCTION_API_BASE = 'https://joblog.arthurjenck.com';

export const API_BASE = import.meta.env.VITE_API_URL ?? PRODUCTION_API_BASE;
