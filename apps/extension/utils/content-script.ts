import {
  parseContractType,
  parseRemote,
  type JobPostingDraft,
} from '@joblog/shared';
export { parseContractType, parseRemote };

type SaveJobResponse = { ok: true } | { ok: false; error?: string };

export async function saveJobPosting(draft: JobPostingDraft): Promise<void> {
  const normalizedDraft = normalizeDraft(draft);
  const response = await browser.runtime.sendMessage({
    type: 'JOBLOG_SAVE_JOB',
    draft: normalizedDraft,
  }) as SaveJobResponse | undefined;

  if (!response?.ok) throw new Error(response?.error ?? 'Erreur de sauvegarde');
}

function normalizeDraft(draft: JobPostingDraft): JobPostingDraft {
  const structured = extractStructuredJobPosting();
  const title =
    cleanText(draft.title) ??
    structured.title ??
    readMetaContent('meta[property="og:title"], meta[name="twitter:title"]') ??
    getDocumentTitleFallback() ??
    `Offre ${getSourceLabel(draft.source)}`;

  const company = resolveCompanyName(draft, structured, title);

  const description =
    cleanText(draft.description ?? null) ??
    structured.description ??
    readMetaContent('meta[name="description"], meta[property="og:description"]') ??
    null;

  const contractSource = [structured.employmentType, document.body?.innerText ?? ''].filter(Boolean).join(' ');

  return {
    ...draft,
    title,
    company,
    description,
    location: cleanText(draft.location ?? null) ?? structured.location ?? null,
    contract_type: draft.contract_type ?? parseContractType(contractSource),
    remote: draft.remote ?? parseRemote(contractSource),
    keywords: draft.keywords ?? structured.keywords ?? null,
    company_website: draft.company_website ?? extractCompanyWebsite(company),
  };
}

export function extractStructuredJobPosting() {
  const candidates: Array<Record<string, unknown>> = [];

  for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
    const raw = script.textContent?.trim();
    if (!raw) continue;

    try {
      collectJobPostingObjects(JSON.parse(raw), candidates);
    } catch {
      continue;
    }
  }

  const record = candidates[0];
  if (!record) return {};

  const employmentType = getFirstString(record.employmentType);

  return {
    title: getFirstString(record.title, record.name),
    company: getOrganizationName(record.hiringOrganization) ?? getOrganizationName(record.organization),
    location: getJobLocation(record.jobLocation),
    description: stripHtml(getFirstString(record.description) ?? ''),
    employmentType,
    keywords: getKeywords(record.keywords),
  };
}

export function injectSaveButton(extractor: () => JobPostingDraft, shouldShow = () => true): void {
  const syncButton = () => {
    const existing = document.getElementById('joblog-save-btn');

    if (!shouldShow()) {
      existing?.remove();
      return;
    }

    if (existing || !document.body) return;

    document.body.appendChild(createSaveButton(extractor));
  };

  let pending = false;
  const scheduleSync = () => {
    if (pending) return;
    pending = true;
    window.setTimeout(() => {
      pending = false;
      syncButton();
    }, 150);
  };

  syncButton();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncButton, { once: true });
  }

  let previousUrl = window.location.href;
  window.setInterval(() => {
    if (previousUrl === window.location.href) return;
    previousUrl = window.location.href;
    scheduleSync();
  }, 500);

  new MutationObserver(scheduleSync).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function createSaveButton(extractor: () => JobPostingDraft): HTMLButtonElement {
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
    } catch (error) {
      btn.textContent = formatButtonError(error);
      btn.disabled = false;
      setTimeout(() => { btn.textContent = '💼 Sauver dans JobLog'; }, 2000);
    }
  });

  return btn;
}

function formatButtonError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Connectez-vous')) return '✗ Connecte-toi';
  if (message.includes('HTTP 401')) return '✗ Connecte-toi';
  if (message.includes('HTTP 403')) return '✗ Non autorisé';
  return '✗ Erreur';
}

export function cleanText(value?: string | null) {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function querySelectorDeep<T extends Element>(selector: string, root: ParentNode = document): T | null {
  const direct = root.querySelector<T>(selector);
  if (direct) return direct;

  for (const element of root.querySelectorAll('*')) {
    if (!(element instanceof Element) || !element.shadowRoot) continue;
    const found = querySelectorDeep<T>(selector, element.shadowRoot);
    if (found) return found;
  }

  return null;
}

function querySelectorAllDeep(selector: string, root: ParentNode = document): Element[] {
  const results = [...root.querySelectorAll(selector)];
  for (const element of root.querySelectorAll('*')) {
    if (!(element instanceof Element) || !element.shadowRoot) continue;
    results.push(...querySelectorAllDeep(selector, element.shadowRoot));
  }
  return results;
}

function companyNameFromFranceTravailEmployerUrl(href: string): string | undefined {
  const match = href.match(/\/page-employeur\/([^/?#]+)/i);
  if (!match?.[1]) return undefined;

  const slug = match[1].replace(/-\d+$/, '');
  return cleanText(slug.replace(/-/g, ' '));
}

function extractFranceTravailCompanyFromPageText(): string | undefined {
  const text = document.body?.innerText ?? '';
  const anchor = 'Voir la page employeur';
  const anchorIndex = text.indexOf(anchor);
  if (anchorIndex === -1) return undefined;

  const lines = text
    .slice(0, anchorIndex)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index > 0; index -= 1) {
    if (!/^\d+ à \d+ salariés$/i.test(lines[index] ?? '')) continue;
    const candidate = cleanText(lines[index - 1]);
    if (candidate && !/^M\.?\s/i.test(candidate)) return candidate;
  }

  return undefined;
}

export function extractFranceTravailCompany(): string | undefined {
  const employerLink = querySelectorDeep<HTMLAnchorElement>('a[href*="page-employeur"]');
  if (employerLink) {
    const mediaBody =
      employerLink.closest('.media-body') ??
      employerLink.closest('.media')?.querySelector('.media-body');

    const fromHeading = cleanText(mediaBody?.querySelector('h3')?.innerText);
    if (fromHeading) return fromHeading;

    const fromUrl = companyNameFromFranceTravailEmployerUrl(employerLink.href);
    if (fromUrl) return fromUrl;
  }

  for (const heading of querySelectorAllDeep('h3.t4.title, h3.title')) {
    if (!(heading instanceof HTMLElement)) continue;

    const name = cleanText(heading.innerText);
    if (!name) continue;

    const section = heading.closest('.media-body');
    if (!section?.querySelector('a[href*="page-employeur"]')) continue;

    return name;
  }

  return extractFranceTravailCompanyFromPageText();
}

function resolveCompanyName(
  draft: JobPostingDraft,
  structured: ReturnType<typeof extractStructuredJobPosting>,
  title: string,
) {
  const fromDraft = cleanText(draft.company);
  if (fromDraft && fromDraft !== 'Entreprise inconnue') return fromDraft;

  if (draft.source === 'francetravail') {
    const fromFranceTravail = extractFranceTravailCompany();
    if (fromFranceTravail) return fromFranceTravail;
  }

  return structured.company ?? inferCompanyFromTitle(title) ?? 'Entreprise inconnue';
}

export function readMetaContent(selector: string) {
  return cleanText(document.querySelector<HTMLMetaElement>(selector)?.content);
}

function getDocumentTitleFallback() {
  const rawTitle = cleanText(document.title);
  if (!rawTitle) return undefined;

  return cleanText(rawTitle.split(/\s[-|·]\s/)[0]);
}

function inferCompanyFromTitle(title: string) {
  const match = title.match(/\bchez\s+(.+)$/i);
  return cleanText(match?.[1]);
}

function getSourceLabel(source: JobPostingDraft['source']) {
  const labels: Record<JobPostingDraft['source'], string> = {
    linkedin: 'LinkedIn',
    wttj: 'Welcome to the Jungle',
    hellowork: 'HelloWork',
    indeed: 'Indeed',
    glassdoor: 'Glassdoor',
    jobteaser: 'Jobteaser',
    jobijoba: 'Jobijoba',
    meteojob: 'Meteojob',
    apec: 'Apec',
    francetravail: 'France Travail',
    cadremploi: 'Cadremploi',
    talent: 'Talent',
    lesjeudis: 'LesJeudis',
    paste: 'URL',
    manual: 'Manuel',
  };

  return labels[source] ?? String(source);
}

function collectJobPostingObjects(value: unknown, candidates: Array<Record<string, unknown>>) {
  if (Array.isArray(value)) {
    for (const item of value) collectJobPostingObjects(item, candidates);
    return;
  }

  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const type = Array.isArray(record['@type']) ? record['@type'].join(' ') : String(record['@type'] ?? '');
  if (type.toLowerCase().includes('jobposting')) candidates.push(record);

  for (const item of Object.values(record)) collectJobPostingObjects(item, candidates);
}

function getFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string') {
      const cleaned = cleanText(value);
      if (cleaned) return cleaned;
    }
    if (Array.isArray(value)) {
      const cleaned = cleanText(value.filter((item) => typeof item === 'string').join(' '));
      if (cleaned) return cleaned;
    }
  }

  return undefined;
}

function getOrganizationName(value: unknown): string | undefined {
  if (typeof value === 'string') return cleanText(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = getOrganizationName(item);
      if (name) return name;
    }
  }
  if (!value || typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  return getFirstString(record.name, record.legalName);
}

function getJobLocation(value: unknown): string | null {
  if (typeof value === 'string') return cleanText(value) ?? null;
  if (Array.isArray(value)) {
    const locations = value.map(getJobLocation).filter(Boolean);
    return locations.length ? locations.join(', ') : null;
  }
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const address = record.address;
  if (typeof address === 'string') return cleanText(address) ?? null;
  if (address && typeof address === 'object') {
    const addressRecord = address as Record<string, unknown>;
    return cleanText([
      addressRecord.addressLocality,
      addressRecord.addressRegion,
      addressRecord.addressCountry,
    ].filter((item) => typeof item === 'string').join(', ')) ?? null;
  }

  return getFirstString(record.name) ?? null;
}

function getKeywords(value: unknown): string[] | null {
  if (typeof value === 'string') {
    const keywords = value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
    return keywords.length ? keywords : null;
  }
  if (Array.isArray(value)) {
    const keywords = value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
    return keywords.length ? keywords : null;
  }
  return null;
}

function stripHtml(value: string) {
  const cleaned = cleanText(value.replace(/<[^>]*>/g, ' '));
  return cleaned;
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
    'jobijoba.com',
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
