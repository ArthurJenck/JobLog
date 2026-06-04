import path from 'node:path';
import { parse as parseQS } from 'node:querystring';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

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
) {
  const rawUrl = req.url ?? '/';
  const qIdx = rawUrl.indexOf('?');
  const qs = qIdx >= 0 ? rawUrl.slice(qIdx + 1) : '';
  const query = Object.fromEntries(new URLSearchParams(qs));

  setLazy(req, 'query', () => query);
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
  const indexFile = path.resolve(process.cwd(), 'api/index.ts');

  return {
    name: 'vite-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? '/';
        if (!rawUrl.startsWith('/api/')) return next();

        const segs = rawUrl.split('?')[0].replace(/^\/api\//, '').split('/').filter(Boolean);
        const ct = req.headers['content-type'];

        const isAuthPassthrough =
          segs[0] === 'auth' &&
          segs[1] !== 'extension-token' &&
          segs[1] !== 'extension-refresh';
        const bodyBuf = !isAuthPassthrough && ct ? await readBodyBuf(req) : null;
        addHelpers(req, res, bodyBuf, ct);

        try {
          const mod = await server.ssrLoadModule(indexFile);
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
