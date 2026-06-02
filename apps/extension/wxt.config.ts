import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'JobLog',
    description: "Sauvegardez des offres d'emploi directement depuis votre navigateur.",
    permissions: ['storage', 'activeTab', 'alarms'],
    host_permissions: [
      'https://joblog.arthurjenck.com/*',
      'http://localhost:5173/*',
    ],
    action: {
      default_popup: 'popup.html',
      default_title: 'JobLog',
    },
  },
});
