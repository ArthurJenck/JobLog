import type { CaptureContext, ExtensionCapturePayload } from './capture-types';

export const MAX_CAPTURE_BYTES = 750 * 1024;

export interface PageCaptureOptions {
  preferredRootSelector?: string;
  captureContext?: CaptureContext;
}

export function collectPageCapture(options: PageCaptureOptions = {}): ExtensionCapturePayload {
  const maxCaptureBytes = 750 * 1024;
  const removableSelectors = [
    'script',
    'style',
    'noscript',
    'iframe',
    'canvas',
    'svg',
    'template',
    'object',
    'embed',
  ].join(',');
  const allowedAttributes = new Set([
    'class',
    'id',
    'role',
    'aria-label',
    'aria-current',
    'aria-selected',
    'href',
    'itemprop',
    'content',
    'data-testid',
    'data-test',
    'data-cy',
    'data-job-id',
    'data-jobid',
    'data-jobkey',
    'data-jk',
    'data-occludable-job-id',
    'data-id',
    'data-entity-urn',
    'data-oid',
    'data-selected',
  ]);

  const clean = (value: string | null | undefined, maxLength = 16 * 1024) => {
    const normalized = value?.replace(/\s+/g, ' ').trim().slice(0, maxLength);
    return normalized || undefined;
  };

  const toSafeHttpUrl = (value: string | null | undefined, maxLength = 16 * 1024) => {
    if (!value) return null;
    try {
      const url = new URL(value, window.location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      url.username = '';
      url.password = '';
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) {
        if (/^(?:access_token|auth|authorization|code|csrf|id_token|jwt|refresh_token|session|state|token)$/i.test(key)) {
          url.searchParams.delete(key);
        }
      }
      if (url.href.length > maxLength) url.search = '';
      return url.href.length <= maxLength ? url.href : `${url.origin}/`;
    } catch {
      return null;
    }
  };

  const collectJobPostings = (value: unknown, result: unknown[]) => {
    const stack = [value];
    let visited = 0;
    while (stack.length && visited < 10_000 && result.length < 20) {
      const current = stack.pop();
      visited += 1;
      if (Array.isArray(current)) {
        for (const child of current) {
          if (stack.length >= 10_000) break;
          stack.push(child);
        }
        continue;
      }
      if (!current || typeof current !== 'object') continue;

      const record = current as Record<string, unknown>;
      const rawType = record['@type'];
      const types = Array.isArray(rawType) ? rawType : [rawType];
      if (types.some((type) => typeof type === 'string' && type.toLowerCase() === 'jobposting')) {
        result.push(record);
        continue;
      }

      for (const child of Object.values(record)) {
        if (stack.length >= 10_000) break;
        stack.push(child);
      }
    }
  };

  const jsonLd: unknown[] = [];
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
    const raw = script.textContent?.trim();
    if (!raw) continue;
    try {
      collectJobPostings(JSON.parse(raw), jsonLd);
    } catch {
      continue;
    }
  }

  const openGraph: Record<string, string> = {};
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[property^="og:"], meta[name^="og:"]')) {
    const key = clean(meta.getAttribute('property') ?? meta.name, 128);
    const value = clean(meta.content, 4_000);
    if (key && value && Object.keys(openGraph).length < 30) openGraph[key] = value;
  }

  const preferredRoot = options.preferredRootSelector
    ? document.querySelector(options.preferredRootSelector)
    : null;
  const sourceRoot = preferredRoot ?? document.body ?? document.documentElement;
  const clone = sourceRoot.cloneNode(true) as Element;

  clone.querySelectorAll(removableSelectors).forEach((element) => element.remove());
  clone.querySelectorAll('input[type="hidden"], [hidden], [aria-hidden="true"]').forEach((element) => element.remove());
  clone.querySelectorAll('input, textarea, select, option').forEach((element) => {
    element.removeAttribute('value');
    element.removeAttribute('checked');
    element.removeAttribute('selected');
    if (element instanceof HTMLTextAreaElement) element.textContent = '';
  });
  clone.querySelectorAll('[contenteditable]').forEach((element) => {
    element.textContent = '';
    element.removeAttribute('contenteditable');
  });

  const elements = [clone, ...clone.querySelectorAll('*')];
  for (const element of elements) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (!allowedAttributes.has(name) || name.startsWith('on') || name === 'style') {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === 'content' && element.tagName !== 'META') {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === 'href') {
        const safeHref = toSafeHttpUrl(attribute.value);
        if (safeHref) element.setAttribute('href', safeHref);
        else element.removeAttribute('href');
      }
    }
  }

  const commentWalker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  let comment = commentWalker.nextNode();
  while (comment) {
    comments.push(comment as Comment);
    comment = commentWalker.nextNode();
  }
  comments.forEach((node) => node.remove());

  const canonicalUrl = toSafeHttpUrl(
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    4_000,
  );
  const description = clean(
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content,
    4_000,
  );

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const boundedJsonLd: unknown[] = [];
  let jsonLdBytes = 0;
  for (const value of jsonLd.slice(0, 10)) {
    let valueBytes = 0;
    try {
      valueBytes = encoder.encode(JSON.stringify(value)).byteLength;
    } catch {
      continue;
    }
    if (valueBytes > 128 * 1024 || jsonLdBytes + valueBytes > 256 * 1024) continue;
    boundedJsonLd.push(value);
    jsonLdBytes += valueBytes;
  }
  const payload: ExtensionCapturePayload = {
    version: 1,
    url: toSafeHttpUrl(window.location.href) ?? window.location.origin,
    title: clean(document.title, 1_000) ?? '',
    canonicalUrl,
    metadata: {
      ...(description ? { description } : {}),
      openGraph,
    },
    jsonLd: boundedJsonLd,
    html: clone.outerHTML,
    ...(options.captureContext ? { captureContext: options.captureContext } : {}),
  };

  const htmlBytes = encoder.encode(payload.html);
  if (encoder.encode(JSON.stringify(payload)).byteLength > maxCaptureBytes) {
    let minimum = 0;
    let maximum = htmlBytes.byteLength;
    let boundedHtml = '';

    while (minimum <= maximum) {
      const candidateLength = Math.floor((minimum + maximum) / 2);
      const candidate = decoder.decode(htmlBytes.slice(0, candidateLength));
      const candidateBytes = encoder.encode(JSON.stringify({ ...payload, html: candidate })).byteLength;
      if (candidateBytes <= maxCaptureBytes) {
        boundedHtml = candidate;
        minimum = candidateLength + 1;
      } else {
        maximum = candidateLength - 1;
      }
    }

    payload.html = boundedHtml;
  }

  return payload;
}
