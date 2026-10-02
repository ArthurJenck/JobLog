import type { VercelRequest } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  getSession: vi.fn(),
}));

vi.mock('./auth.js', () => ({
  getAuth: async () => ({ api: { getSession: mocks.getSession } }),
}));

vi.mock('./env.js', () => ({
  getEnv: (key: string) => mocks.env[key],
}));

import { requireAdminWebSession } from './admin-auth.js';

function request(headers: Record<string, string> = {}) {
  return { headers } as unknown as VercelRequest;
}

function adminSession(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'admin-id',
      email: 'admin@example.com',
      emailVerified: true,
      ...overrides,
    },
  };
}

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.env = {
    ADMIN_USER_ID: 'admin-id',
    ADMIN_MAIL: 'admin@example.com',
    PUBLIC_APP_URL: 'https://joblog.example.com',
  };
});

describe('requireAdminWebSession', () => {
  it('rejects bearer authorization before reading a web session', async () => {
    await expect(requireAdminWebSession(request({ authorization: 'Bearer extension-token' })))
      .rejects.toMatchObject({ status: 403, code: 'forbidden' });
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('requires a fresh authenticated session', async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(requireAdminWebSession(request()))
      .rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(mocks.getSession).toHaveBeenCalledWith(expect.objectContaining({
      query: { disableCookieCache: true },
    }));
  });

  it.each([
    { label: 'unverified email', overrides: { emailVerified: false } },
    { label: 'wrong immutable id', overrides: { id: 'other-id' } },
    { label: 'wrong exact email', overrides: { email: 'other@example.com' } },
  ])('rejects an admin identity with $label', async ({ overrides }) => {
    mocks.getSession.mockResolvedValue(adminSession(overrides));

    await expect(requireAdminWebSession(request()))
      .rejects.toMatchObject({ status: 403, code: 'forbidden' });
  });

  it('fails closed when either admin environment variable is missing', async () => {
    mocks.env.ADMIN_USER_ID = undefined;
    mocks.getSession.mockResolvedValue(adminSession());

    await expect(requireAdminWebSession(request()))
      .rejects.toMatchObject({ status: 403, code: 'forbidden' });
  });

  it('requires the exact origin and JSON content type for mutations', async () => {
    mocks.getSession.mockResolvedValue(adminSession());

    await expect(requireAdminWebSession(request({
      origin: 'https://attacker.example.com',
      'content-type': 'application/json',
    }), { mutation: true })).rejects.toMatchObject({ status: 403, code: 'forbidden' });

    await expect(requireAdminWebSession(request({
      origin: 'https://joblog.example.com',
      'content-type': 'text/plain',
    }), { mutation: true })).rejects.toMatchObject({ status: 400, code: 'invalid_content_type' });
  });

  it('accepts only the matching verified admin web session', async () => {
    mocks.getSession.mockResolvedValue(adminSession({ email: ' Admin@Example.com ' }));

    await expect(requireAdminWebSession(request({
      origin: 'https://joblog.example.com',
      'content-type': 'application/json; charset=utf-8',
    }), { mutation: true })).resolves.toEqual({
      id: 'admin-id',
      email: 'admin@example.com',
    });
  });

  it('accepts the mailto form used by the existing admin email setting', async () => {
    mocks.env.ADMIN_MAIL = 'mailto:admin@example.com';
    mocks.getSession.mockResolvedValue(adminSession());

    await expect(requireAdminWebSession(request())).resolves.toEqual({
      id: 'admin-id',
      email: 'admin@example.com',
    });
  });
});
