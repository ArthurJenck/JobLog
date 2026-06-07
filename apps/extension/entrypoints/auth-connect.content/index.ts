import { API_BASE } from '../../utils/api-base';

const apiMatchPattern = toExtensionMatchPattern(API_BASE);

export default defineContentScript({
  matches: Array.from(new Set([
    'https://joblog.arthurjenck.com/*',
    apiMatchPattern,
    ...(import.meta.env.DEV ? ['http://localhost:3000/*', 'http://localhost:5173/*'] : []),
  ])),
  main() {
    window.addEventListener('message', async (event) => {
      if (event.source !== window) return;
      if (event.data?.type !== 'JOBLOG_AUTH_TOKEN') return;

      const { accessToken, refreshToken } = event.data as { accessToken?: string; refreshToken?: string };
      if (!accessToken || !refreshToken) return;

      await browser.storage.local.set({ access_token: accessToken, refresh_token: refreshToken });
    });

    browser.storage.local.get(['access_token', 'refresh_token']).then(({ access_token, refresh_token }) => {
      if (access_token && refresh_token) return;

      fetch('/api/auth/extension-token', { method: 'POST', credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.accessToken && data?.refreshToken) {
            browser.storage.local.set({ access_token: data.accessToken, refresh_token: data.refreshToken });
          }
        })
        .catch(() => {});
    });
  },
});

function toExtensionMatchPattern(rawUrl: string) {
  const url = new URL(rawUrl);
  const localhostHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

  if (localhostHosts.has(url.hostname)) {
    return `${url.protocol}//${url.hostname}/*`;
  }

  return `${url.origin}/*`;
}
