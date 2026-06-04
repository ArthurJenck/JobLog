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
  manifest: {
    name: 'JobLog',
    description: "Sauvegardez des offres d'emploi directement depuis votre navigateur.",
    icons: {
      '16': 'icon-16.png',
      '32': 'icon-32.png',
      '48': 'icon-48.png',
      '128': 'icon-128.png',
    },
    permissions: ['storage', 'activeTab', 'alarms'],
    host_permissions: hostPermissions,
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
