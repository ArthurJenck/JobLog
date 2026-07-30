import type { VercelRequest, VercelResponse } from '@vercel/node';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineHandler, method } from './define-handler.js';

function fakeReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'GET',
    headers: {},
    query: {},
    body: undefined,
    ...overrides,
  } as unknown as VercelRequest;
}

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    setHeader(key: string, value: string) {
      res.headers[key] = value;
    },
  };
  return res as unknown as VercelResponse & typeof res;
}

describe('defineHandler', () => {
  it('returns a unified 405 for a method with no MethodDef', async () => {
    const handler = defineHandler({
      GET: method({
        auth: 'public',
        async handle() {
          return { json: { ok: true } };
        },
      }),
    });

    const req = fakeReq({ method: 'POST' });
    const res = fakeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'Method not allowed', code: 'method_not_allowed' });
  });

  it('returns a unified 401 when the cron secret does not match', async () => {
    process.env.CRON_SECRET = 'expected-secret';

    const handler = defineHandler({
      POST: method({
        auth: 'cron',
        async handle() {
          return { json: { ok: true } };
        },
      }),
    });

    const req = fakeReq({ method: 'POST', headers: { authorization: 'Bearer wrong-secret' } });
    const res = fakeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Non authentifié', code: 'unauthorized' });
  });

  it('lets a matching cron secret through', async () => {
    process.env.CRON_SECRET = 'expected-secret';

    const handler = defineHandler({
      POST: method({
        auth: 'cron',
        async handle() {
          return { status: 201, json: { ok: true } };
        },
      }),
    });

    const req = fakeReq({ method: 'POST', headers: { authorization: 'Bearer expected-secret' } });
    const res = fakeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns a unified 400 validation_error with zod flatten() details', async () => {
    const handler = defineHandler({
      GET: method({
        auth: 'public',
        query: z.object({ q: z.string().min(3) }),
        async handle({ query }) {
          return { json: { q: query.q } };
        },
      }),
    });

    const req = fakeReq({ method: 'GET', query: { q: 'ab' } });
    const res = fakeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string; code: string; details: unknown };
    expect(body.code).toBe('validation_error');
    expect(body.details).toBeDefined();
  });
});
