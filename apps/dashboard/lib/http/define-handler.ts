import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fromNodeHeaders } from 'better-auth/node';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import type { ZodTypeDef, ZodType as ZodTypeBase } from 'zod';
import { getAuth } from '../auth.js';
import { getCollection } from '../db.js';
import { getExtensionJwtSecret } from '../env.js';
import { checkRateLimit, getClientIp } from '../rate-limit.js';
import { secretEquals } from '../secret-compare.js';
import { ApiError } from './errors.js';

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}

async function touchLastActive(userId: string) {
  const dayAgo = new Date(Date.now() - 86_400_000);
  const col = await getCollection('user');
  await col.updateOne(
    {
      _id: new ObjectId(userId),
      $or: [{ lastActiveAt: { $lt: dayAgo } }, { lastActiveAt: { $exists: false } }],
    },
    { $set: { lastActiveAt: new Date() }, $unset: { inactivityWarnedAt: '' } }
  );
}

export async function getSessionUser(req: VercelRequest): Promise<SessionUser | null> {
  const authHeader = req.headers['authorization'];

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, getExtensionJwtSecret(), {
        algorithms: ['HS256'],
        issuer: 'joblog',
        audience: 'joblog-extension',
      }) as {
        sub: string;
        email: string;
        type?: string;
        iat?: number;
      };
      if (payload.type && payload.type !== 'access') {
        return null;
      }
      if (payload.iat) {
        const revocations = await getCollection('token_revocations');
        const revoked = await revocations.findOne({
          userId: payload.sub,
          revokedAt: { $gt: new Date(payload.iat * 1000) },
        });
        if (revoked) return null;
      }
      await touchLastActive(payload.sub);
      return { id: payload.sub, email: payload.email };
    } catch {
      return null;
    }
  }

  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) return null;

  await touchLastActive(session.user.id);
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

export type AuthMode = 'session' | 'cron' | 'public';
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RateLimitOption {
  max: number;
  windowMs: number;
  scope?: (ctx: { req: VercelRequest; user: SessionUser | null }) => string;
}

export interface HandlerResult {
  status?: number;
  json: unknown;
}

type ZodType<T> = ZodTypeBase<T, ZodTypeDef, any>;

interface BaseMethodDef<TQuery, TBody> {
  query?: ZodType<TQuery>;
  body?: ZodType<TBody>;
  rateLimit?: RateLimitOption;
}

export interface SessionMethodDef<TQuery = unknown, TBody = unknown> extends BaseMethodDef<TQuery, TBody> {
  auth?: 'session';
  handle(ctx: {
    user: SessionUser;
    query: TQuery;
    body: TBody;
    req: VercelRequest;
    res: VercelResponse;
  }): Promise<HandlerResult | void>;
}

export interface PublicOrCronMethodDef<TQuery = unknown, TBody = unknown> extends BaseMethodDef<TQuery, TBody> {
  auth: 'cron' | 'public';
  handle(ctx: {
    user: SessionUser | null;
    query: TQuery;
    body: TBody;
    req: VercelRequest;
    res: VercelResponse;
  }): Promise<HandlerResult | void>;
}

export type MethodDef<TQuery = any, TBody = any> = SessionMethodDef<TQuery, TBody> | PublicOrCronMethodDef<TQuery, TBody>;

export function method<TQuery = unknown, TBody = unknown>(def: SessionMethodDef<TQuery, TBody>): MethodDef<TQuery, TBody>;
export function method<TQuery = unknown, TBody = unknown>(def: PublicOrCronMethodDef<TQuery, TBody>): MethodDef<TQuery, TBody>;
export function method(def: SessionMethodDef | PublicOrCronMethodDef): MethodDef {
  return def;
}

export type MethodTable = Partial<Record<HttpMethod, MethodDef>>;

function isDev() {
  return process.env.NODE_ENV !== 'production';
}

export function defineHandler<T extends MethodTable>(methods: T) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    try {
      const httpMethod = (req.method ?? 'GET') as HttpMethod;
      const def = methods[httpMethod] as MethodDef | undefined;
      if (!def) throw ApiError.methodNotAllowed();

      const authMode: AuthMode = def.auth ?? 'session';
      let user: SessionUser | null = null;

      if (authMode === 'session') {
        user = await getSessionUser(req);
        if (!user) throw ApiError.unauthorized();
      } else if (authMode === 'cron') {
        const authHeader = req.headers['authorization'];
        if (!secretEquals(authHeader, `Bearer ${process.env.CRON_SECRET}`)) {
          throw ApiError.unauthorized();
        }
      }

      if (def.rateLimit) {
        const key = def.rateLimit.scope
          ? def.rateLimit.scope({ req, user })
          : `${(req.url ?? '/').split('?')[0]}:${user?.id ?? getClientIp(req)}`;
        const result = await checkRateLimit({ key, max: def.rateLimit.max, windowMs: def.rateLimit.windowMs });
        if (!result.allowed) {
          if (result.retryAfter) res.setHeader('Retry-After', String(result.retryAfter));
          throw ApiError.rateLimited(result.retryAfter);
        }
      }

      let query: unknown = req.query;
      if (def.query) {
        const parsed = def.query.safeParse(req.query);
        if (!parsed.success) throw ApiError.validation(parsed.error.flatten());
        query = parsed.data;
      }

      let body: unknown = req.body;
      if (def.body) {
        const parsed = def.body.safeParse(req.body);
        if (!parsed.success) throw ApiError.validation(parsed.error.flatten());
        body = parsed.data;
      }

      const result = await def.handle({ user, query, body, req, res } as never);
      if (!result) return;

      return res.status(result.status ?? 200).json(result.json);
    } catch (err) {
      if (err instanceof ApiError) {
        return res.status(err.status).json(err.toBody());
      }

      console.error('[api] unhandled error', err);
      const details = isDev() && err instanceof Error ? err.message : undefined;
      return res.status(500).json({
        error: 'Internal server error',
        code: 'internal_error',
        ...(details ? { details } : {}),
      });
    }
  };
}
