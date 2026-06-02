export default defineContentScript({
  matches: [
    'https://joblog.arthurjenck.com/auth/connect',
    'http://localhost:5173/auth/connect',
  ],
  main() {
    window.addEventListener('message', async (event) => {
      if (event.source !== window) return;
      if (event.data?.type !== 'JOBLOG_AUTH_TOKEN') return;

      const token = event.data.token as string;
      if (!token) return;

      await browser.storage.local.set({ auth_token: token });
    });
  },
});
