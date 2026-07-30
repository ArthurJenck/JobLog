import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { isPrivateOrReservedIp } from './ip-classifier.js';

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface SafeFetchResponse {
  ok: boolean;
  status: number;
  url: string;
  text(): Promise<string>;
}

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost') return true;
  if (!host.includes('.')) return true;
  if (host.endsWith('.internal') || host.endsWith('.local')) return true;
  if (host === 'metadata.google.internal' || host === 'metadata.goog') return true;
  return false;
}

function validateUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeFetchError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('Unsupported protocol');
  }
  if (url.port !== '' && url.port !== '80' && url.port !== '443') {
    throw new SafeFetchError('Blocked port');
  }
  if (isBlockedHostname(url.hostname)) {
    throw new SafeFetchError('Blocked hostname');
  }
  return url;
}

const pinnedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) {
      callback(err, '', 0);
      return;
    }
    const resolved = addresses as Array<{ address: string; family: number }>;
    if (resolved.length === 0) {
      callback(new SafeFetchError('No address resolved'), '', 0);
      return;
    }
    for (const entry of resolved) {
      if (isPrivateOrReservedIp(entry.address)) {
        callback(new SafeFetchError('Blocked resolved address'), '', 0);
        return;
      }
    }
    const wantsAll = typeof options === 'object' && options !== null && options.all === true;
    if (wantsAll) {
      (callback as (err: NodeJS.ErrnoException | null, addresses: Array<{ address: string; family: number }>) => void)(null, resolved);
    } else {
      callback(null, resolved[0].address, resolved[0].family);
    }
  });
};

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function requestOnce(url: URL, headers: Record<string, string>, timeoutMs: number, maxBytes: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const req = client.request(
      url,
      { method: 'GET', headers, lookup: pinnedLookup, timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            res.destroy();
            req.destroy();
            finish(() =>
              resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
            );
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          finish(() =>
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
          ),
        );
        res.on('error', (err) => finish(() => reject(err)));
      },
    );

    req.on('timeout', () => req.destroy(new SafeFetchError('Request timeout')));
    req.on('error', (err) => finish(() => reject(err)));
    req.end();
  });
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;
  const headers = { ...options.headers };

  let currentUrl = rawUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const url = validateUrl(currentUrl);
    const raw = await requestOnce(url, headers, timeoutMs, maxBytes);

    if (raw.status >= 300 && raw.status < 400 && raw.headers.location) {
      if (redirects === MAX_REDIRECTS) throw new SafeFetchError('Too many redirects');
      currentUrl = new URL(raw.headers.location, url).toString();
      continue;
    }

    return {
      ok: raw.status >= 200 && raw.status < 300,
      status: raw.status,
      url: url.toString(),
      text: async () => raw.body,
    };
  }

  throw new SafeFetchError('Too many redirects');
}
