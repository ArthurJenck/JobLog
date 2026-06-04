import type {
  LocationDetails,
  LocationNormalizationStatus,
} from '@joblog/shared';

const COMPLETION_URL = 'https://data.geopf.fr/geocodage/completion/';
const SEARCH_URL = 'https://data.geopf.fr/geocodage/search';
const PROVIDER_TIMEOUT_MS = 8_000;
const MIN_MATCH_SCORE = 0.55;
const AMBIGUITY_SCORE_DELTA = 0.03;

export interface AddressSuggestion {
  label: string;
  city: string | null;
  postcode: string | null;
  lat: number | null;
  lon: number | null;
  type: string | null;
  classification: number | null;
}

export interface StoredLocationNormalization {
  location: string | null;
  location_details: LocationDetails | null;
  location_normalization_status: LocationNormalizationStatus;
  location_normalized_at: Date;
}

interface CompletionResponse {
  status?: unknown;
  results?: unknown;
}

interface CompletionResult {
  country?: unknown;
  city?: unknown;
  x?: unknown;
  y?: unknown;
  zipcode?: unknown;
  street?: unknown;
  classification?: unknown;
  kind?: unknown;
  fulltext?: unknown;
}

interface GeocodeResponse {
  features?: unknown;
}

interface GeocodeFeature {
  properties?: unknown;
  geometry?: unknown;
}

interface GeocodeProperties {
  label?: unknown;
  postcode?: unknown;
  city?: unknown;
  citycode?: unknown;
  x?: unknown;
  y?: unknown;
  score?: unknown;
  _score?: unknown;
  type?: unknown;
  _type?: unknown;
  name?: unknown;
  context?: unknown;
}

interface GeometryPoint {
  coordinates?: unknown;
}

type GeocodeCandidate = {
  details: LocationDetails;
  score: number;
};

export async function searchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  const text = cleanText(query);
  if (!text || text.length < 3) return [];

  const params = new URLSearchParams({
    text,
    type: 'StreetAddress',
    terr: 'METROPOLE,DOMTOM',
    maximumResponses: '6',
  });

  const data = await fetchJson<CompletionResponse>(`${COMPLETION_URL}?${params.toString()}`);
  const results = Array.isArray(data.results) ? data.results : [];

  return results
    .map(mapCompletionResult)
    .filter((item): item is AddressSuggestion => item !== null)
    .slice(0, 6);
}

export async function normalizeLocationForStorage(
  rawLocation: string | null | undefined,
): Promise<StoredLocationNormalization> {
  const now = new Date();
  const location = cleanText(rawLocation);

  if (!location) {
    return buildNormalization(null, null, 'skipped', now);
  }

  if (looksLikeRemoteOnly(location)) {
    return buildNormalization(location, null, 'skipped', now);
  }

  if (looksLikeMultipleLocations(location)) {
    return buildNormalization(location, null, 'ambiguous', now);
  }

  try {
    const candidates = await geocodeLocation(location);
    const best = candidates[0];

    if (!best || best.score < MIN_MATCH_SCORE) {
      return buildNormalization(location, null, 'unmatched', now);
    }

    const second = candidates[1];
    if (second && isAmbiguousMatch(best, second)) {
      return buildNormalization(location, null, 'ambiguous', now);
    }

    return buildNormalization(best.details.label, best.details, 'matched', now);
  } catch {
    return buildNormalization(location, null, 'error', now);
  }
}

async function geocodeLocation(query: string) {
  const params = new URLSearchParams({
    q: query,
    index: 'address',
    autocomplete: '0',
    limit: '3',
  });

  const data = await fetchJson<GeocodeResponse>(`${SEARCH_URL}?${params.toString()}`);
  const features = Array.isArray(data.features) ? data.features : [];

  return features
    .map(mapGeocodeFeature)
    .filter((item): item is GeocodeCandidate => item !== null)
    .sort((a, b) => b.score - a.score);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Geoplateforme HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function mapCompletionResult(raw: unknown): AddressSuggestion | null {
  if (!raw || typeof raw !== 'object') return null;

  const item = raw as CompletionResult;
  if (item.country !== 'StreetAddress') return null;

  const label = formatLabel(asString(item.fulltext));
  if (!label) return null;

  return {
    label,
    city: asString(item.city),
    postcode: asString(item.zipcode),
    lat: asNumber(item.y),
    lon: asNumber(item.x),
    type: asString(item.kind) ?? asString(item.street),
    classification: asNumber(item.classification),
  };
}

function mapGeocodeFeature(raw: unknown): GeocodeCandidate | null {
  if (!raw || typeof raw !== 'object') return null;

  const feature = raw as GeocodeFeature;
  if (!feature.properties || typeof feature.properties !== 'object') return null;

  const properties = feature.properties as GeocodeProperties;
  const label = formatLabel(asString(properties.label) ?? asString(properties.name));
  if (!label) return null;

  const geometry = feature.geometry && typeof feature.geometry === 'object'
    ? feature.geometry as GeometryPoint
    : null;
  const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : [];
  const lon = asNumber(coordinates[0]) ?? asNumber(properties.x);
  const lat = asNumber(coordinates[1]) ?? asNumber(properties.y);
  const score = asNumber(properties.score) ?? asNumber(properties._score) ?? 0;
  const rawRecord = {
    properties: properties as Record<string, unknown>,
    geometry: feature.geometry && typeof feature.geometry === 'object'
      ? feature.geometry as Record<string, unknown>
      : null,
  };

  return {
    score,
    details: {
      label,
      city: asString(properties.city),
      postcode: asString(properties.postcode),
      citycode: asString(properties.citycode),
      lat,
      lon,
      type: asString(properties.type) ?? asString(properties._type),
      score,
      source: 'geoplateforme',
      raw: rawRecord,
    },
  };
}

function isAmbiguousMatch(best: GeocodeCandidate, second: GeocodeCandidate) {
  if (second.score < MIN_MATCH_SCORE) return false;
  if (best.score - second.score > AMBIGUITY_SCORE_DELTA) return false;

  return [
    best.details.label !== second.details.label,
    best.details.city !== second.details.city,
    best.details.postcode !== second.details.postcode,
  ].some(Boolean);
}

function buildNormalization(
  location: string | null,
  details: LocationDetails | null,
  status: LocationNormalizationStatus,
  normalizedAt: Date,
): StoredLocationNormalization {
  return {
    location,
    location_details: details,
    location_normalization_status: status,
    location_normalized_at: normalizedAt,
  };
}

function looksLikeRemoteOnly(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

  return [
    'remote',
    'full remote',
    'teletravail',
    'a distance',
    'distanciel',
    'partout',
    'france entiere',
  ].includes(normalized);
}

function looksLikeMultipleLocations(value: string) {
  if (/[/|;]/.test(value)) return true;
  return /\s+(ou|et)\s+/i.test(value);
}

function cleanText(value?: string | null) {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

function formatLabel(value: string | null) {
  return cleanText(value?.replace(/\s*,\s*/g, ', '));
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
