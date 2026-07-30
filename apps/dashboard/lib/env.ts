import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

let loaded = false;

function parseEnvValue(value: string) {
  const trimmed = value.trim();
  const quote = trimmed[0];

  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    const inner = trimmed.slice(1, -1);
    return quote === '"' ? inner.replace(/\\n/g, '\n').replace(/\\r/g, '\r') : inner;
  }

  return trimmed;
}

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;

  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalizedLine = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = normalizedLine.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = normalizedLine.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = parseEnvValue(normalizedLine.slice(separatorIndex + 1));
  }
}

export function loadLocalEnv() {
  if (loaded) return;
  loaded = true;

  const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  loadEnvFile(join(appRoot, '.env.local'));
  loadEnvFile(join(process.cwd(), '.env.local'));
}

export function getEnv(key: string) {
  loadLocalEnv();
  return process.env[key];
}

export function requireEnv(key: string) {
  const value = getEnv(key);
  if (!value) {
    throw new Error(`Missing ${key}. Add it to Vercel env vars or apps/dashboard/.env.local.`);
  }
  return value;
}

export function getExtensionJwtSecret() {
  return getEnv('EXTENSION_JWT_SECRET') || requireEnv('BETTER_AUTH_SECRET');
}

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  BETTER_AUTH_SECRET: z.string().min(1, 'BETTER_AUTH_SECRET is required'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  CRON_SECRET: z.string().min(1, 'CRON_SECRET is required'),
  VAPID_PUBLIC_KEY: z.string().min(1, 'VAPID_PUBLIC_KEY is required'),
  VAPID_PRIVATE_KEY: z.string().min(1, 'VAPID_PRIVATE_KEY is required'),
  SNOOZE_JWT_SECRET: z.string().min(1, 'SNOOZE_JWT_SECRET is required'),

  EXTENSION_JWT_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GEMINI_DAILY_QUOTA: z.string().optional(),
  GEMINI_USER_DAILY_QUOTA: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),
  JINA_API_KEY: z.string().optional(),
  JINA_ALERT_EMAIL: z.string().optional(),
  JINA_ESTIMATED_TOKEN_ALERT_THRESHOLD: z.string().optional(),
  LOGO_DEV_SECRET_KEY: z.string().optional(),
  VITE_LOGO_DEV_TOKEN: z.string().optional(),
  ADMIN_MAIL: z.string().optional(),
  RESEND_FROM: z.string().optional(),
  RESEND_ALERT_FROM: z.string().optional(),
  RESEND_AUTH_FROM: z.string().optional(),
  RESEND_REMINDER_FROM: z.string().optional(),
  PUBLIC_APP_URL: z.string().optional(),
  PUBLIC_EXTENSION_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

function validateEnv(): Env {
  if (validatedEnv) return validatedEnv;

  loadLocalEnv();
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration - ${details}`);
  }

  validatedEnv = result.data;
  return validatedEnv;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return validateEnv()[prop as keyof Env];
  },
});
