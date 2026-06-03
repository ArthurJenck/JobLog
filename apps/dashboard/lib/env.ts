import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
