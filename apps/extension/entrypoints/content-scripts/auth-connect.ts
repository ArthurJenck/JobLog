export default defineContentScript({
  matches: [
    'https://joblog.arthurjenck.com/*',
    'http://localhost:5173/*',
  ],
  main() {
    window.addEventListener('message', async (event) => {
      if (event.source !== window) return;
      if (event.data?.type !== 'JOBLOG_AUTH_TOKEN') return;

      const token = event.data.token as string;
      if (!token) return;

      await browser.storage.local.set({ auth_token: token });
    });

    browser.storage.local.get('auth_token').then(({ auth_token }) => {
      if (auth_token) return;

      fetch('/api/auth/extension-token', { method: 'POST', credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.token) {
            browser.storage.local.set({ auth_token: data.token });
          }
        })
        .catch(() => {});
    });
  },
});
