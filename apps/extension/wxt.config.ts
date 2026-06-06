import { defineConfig } from 'wxt';

const isProd = process.env.NODE_ENV === 'production';

const apiHostPermission = process.env.VITE_API_URL
  ? `${new URL(process.env.VITE_API_URL).origin}/*`
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
