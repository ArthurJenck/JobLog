import { parseContractType, parseRemote } from '@joblog/shared';
import { parseHTML } from 'linkedom';
import type {
  ExtensionRecipeInput,
  ExtensionSnapshot,
  RecipeExtractorSchema,
  RecipeIdentityRuleSchema,
} from './schemas.js';
import type { z } from 'zod';

type RecipeExtractor = z.infer<typeof RecipeExtractorSchema>;
type IdentityRule = z.infer<typeof RecipeIdentityRuleSchema>;

interface RecipeElement {
  textContent: string | null;
  remove(): void;
  getAttribute(name: string): string | null;
}

interface RecipeDocument {
  textContent: string | null;
  documentElement: { textContent: string | null } | null;
  querySelector(selector: string): {
    textContent: string | null;
    getAttribute(name: string): string | null;
  } | null;
  querySelectorAll(selector: string): ArrayLike<RecipeElement>;
}

export interface RecipeExtractionResult {
  nativeJobId: string | null;
  fields: Record<string, string | null>;
}

export function mergeRecipeExtractionResults(
  primary: RecipeExtractionResult | null,
  fallback: RecipeExtractionResult | null,
): RecipeExtractionResult {
  const fieldNames = new Set([
    ...Object.keys(fallback?.fields ?? {}),
    ...Object.keys(primary?.fields ?? {}),
  ]);
  const fields = Object.fromEntries(
    [...fieldNames].map((field) => [
      field,
      firstValue([primary?.fields[field], fallback?.fields[field]]),
    ]),
  );

  return {
    nativeJobId: firstValue([primary?.nativeJobId, fallback?.nativeJobId]),
    fields,
  };
}

export function matchesRecipe(recipe: ExtensionRecipeInput, rawUrl: string) {
  const url = new URL(rawUrl);
  const hostname = url.hostname.toLowerCase();
  const hostnameMatches = recipe.hostnames.some((rule) =>
    rule.startsWith('*.')
      ? hostname.endsWith(rule.slice(1)) && hostname !== rule.slice(2)
      : hostname === rule,
  );
  if (!hostnameMatches) return false;

  const pathMatches = recipe.pathRules.length === 0 || recipe.pathRules.some((rule) => {
    if (rule.kind === 'exact') return url.pathname === rule.value;
    if (rule.kind === 'prefix') return url.pathname.startsWith(rule.value);
    return url.pathname.includes(rule.value);
  });
  if (!pathMatches) return false;

  return recipe.parameterRules.every((rule) => {
    const value = url.searchParams.get(rule.name);
    if (rule.required && value === null) return false;
    return rule.equals === undefined || value === rule.equals;
  });
}

export function extractWithRecipe(
  snapshot: ExtensionSnapshot,
  recipe: ExtensionRecipeInput,
): RecipeExtractionResult {
  const { document } = parseHTML(snapshot.html) as unknown as { document: RecipeDocument };
  const url = new URL(snapshot.url);
  const canonicalUrl = snapshot.canonicalUrl ? safeUrl(snapshot.canonicalUrl) : null;
  const jobPosting = findJobPosting(snapshot.jsonLd);

  const fields: Record<string, string | null> = {};
  for (const [field, extractors] of Object.entries(recipe.extractors)) {
    if (!extractors) continue;
    fields[field] = firstValue(
      extractors.map((extractor) => readExtractor(extractor, { document, url, jobPosting, snapshot })),
    );
  }

  const nativeJobId = firstValue(recipe.identityRules.map((rule) =>
    readIdentity(rule, { document, url, canonicalUrl }),
  ));

  return { nativeJobId, fields };
}

export function stableRecipeJson(recipe: ExtensionRecipeInput) {
  return JSON.stringify(sortValue(recipe));
}

function readExtractor(
  extractor: RecipeExtractor,
  context: {
    document: RecipeDocument;
    url: URL;
    jobPosting: Record<string, unknown> | null;
    snapshot: ExtensionSnapshot;
  },
) {
  let value: unknown;
  if (extractor.kind === 'selector') {
    const element = context.document.querySelector(extractor.selector);
    value = extractor.read === 'text'
      ? element?.textContent
      : element?.getAttribute(extractor.read);
  } else if (extractor.kind === 'json_ld') {
    value = readPath(context.jobPosting, extractor.path);
  } else if (extractor.kind === 'meta') {
    value = extractor.key === 'description'
      ? context.snapshot.metadata.description
      : context.snapshot.metadata.openGraph[extractor.key];
  } else if (extractor.kind === 'url_query') {
    value = context.url.searchParams.get(extractor.name);
  } else {
    value = pathSegments(context.url)[extractor.index];
  }

  return applyTransforms(stringifyValue(value), extractor.transforms);
}

function readIdentity(
  rule: IdentityRule,
  context: { document: RecipeDocument; url: URL; canonicalUrl: URL | null },
) {
  if (rule.kind === 'canonical_url') return (context.canonicalUrl ?? context.url).toString();
  if (rule.kind === 'url_query') return context.url.searchParams.get(rule.name);
  if (rule.kind === 'canonical_query') return context.canonicalUrl?.searchParams.get(rule.name);
  if (rule.kind === 'url_path_segment') return pathSegments(context.url)[rule.index];

  const element = context.document.querySelector(rule.selector);
  if (rule.kind === 'selector_url_query') {
    const rawUrl = element?.getAttribute(rule.attribute);
    if (!rawUrl) return null;
    return safeUrl(new URL(rawUrl, context.url).toString())?.searchParams.get(rule.name) ?? null;
  }
  return rule.kind === 'selector_text'
    ? element?.textContent
    : element?.getAttribute(rule.attribute);
}

function applyTransforms(value: string | null, transforms: RecipeExtractor['transforms']) {
  let current = value;
  for (const transform of transforms) {
    if (current === null) break;
    if (transform === 'trim') {
      current = current.trim();
    } else if (transform === 'normalize_spaces') {
      current = current.replace(/\s+/g, ' ').trim();
    } else if (transform === 'strip_html') {
      current = stripHtmlText(current);
    } else if (transform === 'parse_contract') {
      current = parseContractType(current);
    } else if (transform === 'parse_remote') {
      current = parseRemote(current);
    }
  }
  return typeof current === 'string' && current.trim() ? current.trim() : null;
}

export function stripHtmlText(value: string) {
  const wrapped = `<!doctype html><html><body>${value}</body></html>`;
  const { document } = parseHTML(wrapped) as unknown as { document: RecipeDocument };
  for (const element of Array.from(document.querySelectorAll('script,style,noscript'))) {
    element.remove();
  }
  return (document.documentElement?.textContent ?? document.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findJobPosting(values: unknown[]): Record<string, unknown> | null {
  const queue = [...values];
  while (queue.length > 0) {
    const value = queue.shift();
    if (Array.isArray(value)) {
      queue.push(...value);
      continue;
    }
    if (!value || typeof value !== 'object') continue;

    const record = value as Record<string, unknown>;
    const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
    if (types.some((type) => String(type).toLowerCase() === 'jobposting')) return record;
    queue.push(...Object.values(record));
  }
  return null;
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (Array.isArray(current)) current = current[0];
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function stringifyValue(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(stringifyValue).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return stringifyValue(record.name ?? record.value ?? null);
  }
  return null;
}

function firstValue(values: Array<string | null | undefined>) {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? null;
}

function pathSegments(url: URL) {
  return url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
}

function safeUrl(rawUrl: string) {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortValue(nested)]),
  );
}
