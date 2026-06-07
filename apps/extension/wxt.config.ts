import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'wxt';

const isProd = process.env.NODE_ENV === 'production';
const mode = process.env.NODE_ENV ?? 'development';
const apiUrl = process.env.VITE_API_URL ?? readEnvValue('VITE_API_URL');

const apiHostPermission = apiUrl
  ? toExtensionMatchPattern(apiUrl)
  : 'https://joblog.arthurjenck.com/*';

const hostPermissions = Array.from(new Set([
  'https://joblog.arthurjenck.com/*',
  apiHostPermission,
  ...(!isProd ? ['http://localhost:3000/*', 'http://localhost:5173/*'] : []),
]));

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  zip: {
    sourcesRoot: '../..',
    excludeSources: ['apps/dashboard/**'],
  },
  manifest: {
    name: "JobLog - Tracker d'offres d'emploi",
    description: "Sauvegardez des offres d'emploi directement depuis votre navigateur.",
    icons: {
      '16': 'icon-16.png',
      '32': 'icon-32.png',
      '48': 'icon-48.png',
      '128': 'icon-128.png',
    },
    permissions: ['storage', 'activeTab', 'alarms'],
    host_permissions: hostPermissions,
    browser_specific_settings: {
      gecko: {
        id: 'joblog@arthurjenck.com',
        strict_min_version: '115.0',
        data_collection_permissions: {
          required: ['websiteContent'],
        },
      },
    },
    action: {
      default_popup: 'popup.html',
      default_title: 'JobLog',
      default_icon: {
        '16': 'icon-16.png',
        '32': 'icon-32.png',
        '48': 'icon-48.png',
        '128': 'icon-128.png',
      },
    },
  },
});

function readEnvValue(key: string) {
  for (const filename of [`.env.${mode}.local`, `.env.${mode}`, '.env.local', '.env']) {
    const url = new URL(filename, import.meta.url);
    if (!existsSync(url)) continue;

    const match = readFileSync(url, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith(`${key}=`));

    if (!match) continue;
    return unquoteEnvValue(match.slice(key.length + 1));
  }

  return undefined;
}

function unquoteEnvValue(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function toExtensionMatchPattern(rawUrl: string) {
  const url = new URL(rawUrl);
  const localhostHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

  if (localhostHosts.has(url.hostname)) {
    return `${url.protocol}//${url.hostname}/*`;
  }

  return `${url.origin}/*`;
}
