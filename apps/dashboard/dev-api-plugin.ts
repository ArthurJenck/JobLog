import fs from 'node:fs';
import path from 'node:path';
import { parse as parseQS } from 'node:querystring';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

type Segment =
  | { kind: 'static'; value: string }
  | { kind: 'param'; name: string }
  | { kind: 'catchall'; name: string };

interface Route {
  pattern: Segment[];
  file: string;
  hasCatchall: boolean;
}

function parseSegment(s: string): Segment {
  if (s.startsWith('[...') && s.endsWith(']')) return { kind: 'catchall', name: s.slice(4, -1) };
  if (s.startsWith('[') && s.endsWith(']')) return { kind: 'param', name: s.slice(1, -1) };
  return { kind: 'static', value: s };
}

function buildRoutes(apiDir: string): Route[] {
  const routes: Route[] = [];

  function walk(dir: string, prefix: Segment[]) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), [...prefix, parseSegment(entry.name)]);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        const base = entry.name.slice(0, -3);
        const pattern = base === 'index' ? prefix : [...prefix, parseSegment(base)];
        const hasCatchall = pattern.some((s) => s.kind === 'catchall');
        routes.push({ pattern, file: path.join(dir, entry.name), hasCatchall });
      }
    }
  }

  walk(apiDir, []);

  routes.sort((a, b) => {
    const score = (r: Route) =>
      r.pattern.reduce((acc, s) => acc + (s.kind === 'static' ? 2 : s.kind === 'param' ? 1 : 0), 0);
    return score(b) - score(a);
  });

  return routes;
}

function matchRoute(
  routes: Route[],
  urlSegs: string[],
): { route: Route; params: Record<string, string | string[]> } | null {
  for (const route of routes) {
    const params: Record<string, string | string[]> = {};
    let ok = true;
    let ui = 0;
    for (const seg of route.pattern) {
      if (seg.kind === 'static') {
        if (urlSegs[ui] !== seg.value) { ok = false; break; }
        ui++;
      } else if (seg.kind === 'param') {
        if (ui >= urlSegs.length) { ok = false; break; }
        params[seg.name] = urlSegs[ui++];
      } else {
        if (ui >= urlSegs.length) { ok = false; break; }
        params[seg.name] = urlSegs.slice(ui);
        ui = urlSegs.length;
      }
    }
    if (ok && ui === urlSegs.length) return { route, params };
  }
  return null;
}

async function readBodyBuf(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer | string) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseBuf(buf: Buffer, ct: string | undefined): unknown {
  if (!ct || !buf.length) return undefined;
  if (ct.includes('application/json')) {
    try { return JSON.parse(buf.toString()); } catch { return buf.toString(); }
  }
  if (ct.includes('x-www-form-urlencoded')) return parseQS(buf.toString());
  return buf.toString();
}

function setLazy(obj: object, prop: string, get: () => unknown) {
  const reset = { configurable: true, writable: true };
  Object.defineProperty(obj, prop, {
    configurable: true,
    get() { const v = get(); Object.defineProperty(obj, prop, { ...reset, value: v }); return v; },
    set(v: unknown) { Object.defineProperty(obj, prop, { ...reset, value: v }); },
  });
}

function addHelpers(
  req: IncomingMessage,
  res: ServerResponse,
  bodyBuf: Buffer | null,
  ct: string | undefined,
  routeParams: Record<string, string | string[]>,
) {
  const rawUrl = req.url ?? '/';
  const qIdx = rawUrl.indexOf('?');
  const qs = qIdx >= 0 ? rawUrl.slice(qIdx + 1) : '';
  const merged = { ...Object.fromEntries(new URLSearchParams(qs)), ...routeParams };

  setLazy(req, 'query', () => merged);
  setLazy(req, 'body', () => (bodyBuf !== null ? parseBuf(bodyBuf, ct) : undefined));
  setLazy(req, 'cookies', () => {
    const h = req.headers['cookie'] ?? '';
    return Object.fromEntries(
      h.split(';').filter(Boolean).map((p) => {
        const [k, ...v] = p.trim().split('=');
        return [k.trim(), decodeURIComponent(v.join('='))];
      }),
    );
  });

  const r = res as ServerResponse & {
    status(c: number): typeof r;
    json(b: unknown): void;
    send(b: unknown): void;
    redirect(s: number | string, u?: string): void;
  };
  r.status = function (c) { this.statusCode = c; return this; };
  r.json = function (b) {
    if (!this.headersSent) this.setHeader('content-type', 'application/json; charset=utf-8');
    this.end(JSON.stringify(b));
  };
  r.send = function (b) { this.end(b as Buffer | string); };
  r.redirect = function (s, u?) {
    const code = typeof s === 'number' ? s : 307;
    const dest = typeof s === 'string' ? s : u!;
    this.writeHead(code, { Location: dest }).end();
  };
}

export function apiDevPlugin(): Plugin {
  const apiDir = path.resolve(process.cwd(), 'api');
  let routes: Route[] = [];

  return {
    name: 'vite-api-dev',
    apply: 'serve',
    configureServer(server) {
      routes = buildRoutes(apiDir);

      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? '/';
        if (!rawUrl.startsWith('/api/')) return next();

        const bare = rawUrl.split('?')[0].replace(/^\/api\//, '');
        const segs = bare ? bare.split('/').filter(Boolean) : [];

        routes = buildRoutes(apiDir);
        const result = matchRoute(routes, segs);
        if (!result) {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }

        const { route, params } = result;
        const ct = req.headers['content-type'];
        const firstStatic = route.pattern[0]?.kind === 'static' ? (route.pattern[0] as { kind: 'static'; value: string }).value : null;
        const catchallFirst = Array.isArray(params['all']) ? params['all'][0] : params['all'];
        const isAuthPassthrough =
          route.hasCatchall &&
          firstStatic === 'auth' &&
          catchallFirst !== 'extension-token' &&
          catchallFirst !== 'extension-refresh';
        const bodyBuf = !isAuthPassthrough && ct ? await readBodyBuf(req) : null;
        addHelpers(req, res, bodyBuf, ct, params);

        try {
          const mod = await server.ssrLoadModule(route.file);
          await (mod.default as (req: IncomingMessage, res: ServerResponse) => Promise<void>)(req, res);
        } catch (err) {
          console.error('[api-dev]', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: String(err) }));
          }
        }
      });
    },
  };
}
