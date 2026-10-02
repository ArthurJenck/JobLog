import type { VercelRequest } from '@vercel/node';
import { fromNodeHeaders } from 'better-auth/node';
import { getAuth } from './auth.js';
import { getEnv } from './env.js';
import { ApiError } from './http/errors.js';

export interface AdminUser {
  id: string;
  email: string;
}

export function normalizeAdminEmail(value: string | undefined) {
  return value?.replace(/^mailto:/i, '').trim().toLowerCase();
}

export async function requireAdminWebSession(
  req: VercelRequest,
  options: { mutation?: boolean } = {},
): Promise<AdminUser> {
  if (req.headers.authorization) throw ApiError.forbidden();

  const auth = await getAuth();
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
    query: { disableCookieCache: true },
  });
  if (!session) throw ApiError.unauthorized();

  const expectedId = getEnv('ADMIN_USER_ID')?.trim();
  const expectedEmail = normalizeAdminEmail(getEnv('ADMIN_MAIL'));
  if (!expectedId || !expectedEmail) throw ApiError.forbidden();

  const email = session.user.email.trim().toLowerCase();
  if (!session.user.emailVerified || session.user.id !== expectedId || email !== expectedEmail) {
    throw ApiError.forbidden();
  }

  if (options.mutation) {
    const publicAppUrl = getEnv('PUBLIC_APP_URL');
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    if (!publicAppUrl || origin !== new URL(publicAppUrl).origin) throw ApiError.forbidden('Origine invalide');

    const contentType = typeof req.headers['content-type'] === 'string'
      ? req.headers['content-type'].split(';', 1)[0].trim().toLowerCase()
      : '';
    if (contentType !== 'application/json') {
      throw ApiError.badRequest('Content-Type application/json requis', 'invalid_content_type');
    }
  }

  return { id: session.user.id, email };
}
