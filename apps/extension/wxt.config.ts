import { defineConfig } from 'wxt';

const apiHostPermission = process.env.VITE_API_URL
  ? `${new URL(process.env.VITE_API_URL).origin}/*`
  : 'https://joblog.arthurjenck.com/*';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'JobLog',
    description: "Sauvegardez des offres d'emploi directement depuis votre navigateur.",
    permissions: ['storage', 'activeTab', 'alarms'],
    host_permissions: Array.from(new Set([
      'https://joblog.arthurjenck.com/*',
      apiHostPermission,
      'http://localhost:3000/*',
      'http://localhost:5173/*',
    ])),
    action: {
      default_popup: 'popup.html',
      default_title: 'JobLog',
    },
  },
});
