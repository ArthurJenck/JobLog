import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCollection } from '../../lib/db.js';
import handler from './platforms.js';
import { hashAutomationToken } from './token.js';

vi.mock('../../lib/db.js', () => ({ getCollection: vi.fn() }));

const token = `jl_n8n_${'A'.repeat(43)}`;
const platformId = new ObjectId();

function request(authorization?: string): VercelRequest {
  return {
    method: 'GET',
    url: '/api/automation/platforms',
    headers: authorization ? { authorization } : {},
    query: {},
  } as unknown as VercelRequest;
}

function response() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(value: unknown) {
      res.body = value;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
  };
  return res as unknown as VercelResponse & typeof res;
}

describe('GET /api/automation/platforms', () => {
  beforeEach(() => vi.resetAllMocks());

  it('refuses missing and incorrect keys', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    vi.mocked(getCollection).mockResolvedValue({ findOne } as never);

    for (const authorization of [undefined, `Bearer jl_n8n_${'B'.repeat(43)}`]) {
      const res = response();
      await handler(request(authorization), res);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Non authentifié', code: 'unauthorized' });
    }
  });

  it('returns only the current user platform identifiers, names, URLs and order', async () => {
    const findOne = vi.fn().mockResolvedValue({ userId: 'user-1' });
    const toArray = vi.fn().mockResolvedValue([{
      _id: platformId,
      name: 'LinkedIn',
      url: 'https://www.linkedin.com/jobs',
      order: 0,
      checkedAt: new Date(),
    }]);
    const sort = vi.fn().mockReturnValue({ toArray });
    const find = vi.fn().mockReturnValue({ sort });
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === 'automation_tokens') return { findOne } as never;
      return { find } as never;
    });

    const res = response();
    await handler(request(`Bearer ${token}`), res);

    expect(findOne).toHaveBeenCalledWith({ tokenHash: hashAutomationToken(token) });
    expect(find).toHaveBeenCalledWith(
      { userId: 'user-1' },
      { projection: { name: 1, url: 1, order: 1 } },
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      data: [{ id: platformId.toString(), name: 'LinkedIn', url: 'https://www.linkedin.com/jobs', order: 0 }],
    });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
