import type { JobPostingDraft } from '@joblog/shared';

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://joblog.arthurjenck.com';

export async function saveJobPosting(draft: JobPostingDraft): Promise<void> {
  const { auth_token } = await browser.storage.local.get('auth_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth_token) headers['Authorization'] = `Bearer ${auth_token}`;

  const jpRes = await fetch(`${API_BASE}/api/job-postings`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ ...draft, scrape_method: 'extension' }),
  });
  if (!jpRes.ok) throw new Error(`job-postings: ${jpRes.status}`);
  const { jobPostingId } = await jpRes.json() as { jobPostingId: string };

  const appRes = await fetch(`${API_BASE}/api/applications`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ jobPostingId, status: 'saved' }),
  });
  if (!appRes.ok) throw new Error(`applications: ${appRes.status}`);
}

export function injectSaveButton(extractor: () => JobPostingDraft): void {
  if (document.getElementById('joblog-save-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'joblog-save-btn';
  btn.textContent = '💼 Sauver dans JobLog';
  Object.assign(btn.style, {
    position: 'fixed',
    top: '80px',
    right: '20px',
    zIndex: '9999',
    background: '#0f0f0f',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    fontFamily: 'system-ui, sans-serif',
  });

  btn.addEventListener('click', async () => {
    btn.textContent = '…';
    btn.disabled = true;
    try {
      await saveJobPosting(extractor());
      btn.textContent = '✓ Sauvegardé';
      setTimeout(() => btn.remove(), 2000);
    } catch {
      btn.textContent = '✗ Erreur';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = '💼 Sauver dans JobLog'; }, 2000);
    }
  });

  document.body.appendChild(btn);
}

export function parseContractType(raw: string) {
  const r = raw.toLowerCase();
  if (r.includes('cdi')) return 'cdi' as const;
  if (r.includes('cdd')) return 'cdd' as const;
  if (r.includes('alternance') || r.includes('apprentissage')) return 'alternance' as const;
  if (r.includes('stage')) return 'stage' as const;
  if (r.includes('freelance') || r.includes('consultant')) return 'freelance' as const;
  return null;
}

export function parseRemote(raw: string) {
  const r = raw.toLowerCase();
  if (r.includes('télétravail complet') || r.includes('full remote') || r.includes('remote')) return 'remote' as const;
  if (r.includes('hybride')) return 'hybride' as const;
  if (r.includes('présentiel') || r.includes('sur site')) return 'présentiel' as const;
  return null;
}

export function extractCompanyWebsite(company?: string | null) {
  return extractStructuredCompanyWebsite() ?? extractLinkedCompanyWebsite(company);
}

function extractStructuredCompanyWebsite() {
  const candidates: string[] = [];

  for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
    const raw = script.textContent?.trim();
    if (!raw) continue;

    try {
      collectJsonLdUrls(JSON.parse(raw), candidates);
    } catch {
      continue;
    }
  }

  for (const candidate of candidates) {
    const domain = normalizeCompanyDomain(candidate);
    if (domain) return domain;
  }

  return null;
}

function collectJsonLdUrls(value: unknown, candidates: string[]) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdUrls(item, candidates);
    return;
  }

  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  for (const key of ['hiringOrganization', 'organization', 'company', 'publisher', 'author', '@graph']) {
    collectJsonLdUrls(record[key], candidates);
  }

  for (const key of ['url', 'website', 'sameAs']) {
    const raw = record[key];
    if (typeof raw === 'string') candidates.push(raw);
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === 'string') candidates.push(item);
      }
    }
  }
}

function extractLinkedCompanyWebsite(company?: string | null) {
  const normalizedCompany = normalizeText(company ?? '');
  const candidates = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .map((anchor) => {
      const domain = normalizeCompanyDomain(anchor.href);
      if (!domain) return null;

      const text = normalizeText([
        anchor.innerText,
        anchor.getAttribute('aria-label'),
        anchor.getAttribute('title'),
        anchor.href,
      ].filter(Boolean).join(' '));

      let score = 0;
      if (text.includes('site web') || text.includes('website') || text.includes('official')) score += 4;
      if (text.includes('site internet') || text.includes('visiter le site')) score += 4;
      if (normalizedCompany && domain.includes(normalizedCompany.replace(/\s+/g, ''))) score += 2;
      if (normalizedCompany && text.includes(normalizedCompany)) score += 1;
      if (text.includes('postuler') || text.includes('apply') || text.includes('candidater')) score -= 4;
      if (text.includes('job') || text.includes('career') || text.includes('emploi')) score -= 1;

      return { domain, score };
    })
    .filter((candidate): candidate is { domain: string; score: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score);

  const best = candidates.find((candidate) => candidate.score >= 2);
  return best?.domain ?? null;
}

function normalizeCompanyDomain(raw: string) {
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    const domain = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (!domain.includes('.')) return null;
    if (isIgnoredCompanyDomain(domain)) return null;

    return domain;
  } catch {
    return null;
  }
}

function isIgnoredCompanyDomain(domain: string) {
  return [
    window.location.hostname.replace(/^www\./i, '').toLowerCase(),
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
    'facebook.com',
    'instagram.com',
    'x.com',
    'twitter.com',
    'youtube.com',
    'tiktok.com',
  ].some((ignored) => domain === ignored || domain.endsWith(`.${ignored}`));
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
