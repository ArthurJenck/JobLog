export default defineBackground(() => {
  const API_BASE = import.meta.env.VITE_API_URL ?? 'https://joblog.arthurjenck.com';
  const POLL_INTERVAL_MS = 30 * 60 * 1000;

  async function updateBadge() {
    try {
      const token = await getAuthToken();
      if (!token) {
        browser.action.setBadgeText({ text: '' });
        return;
      }
      const res = await fetch(`${API_BASE}/api/reminders/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { count } = await res.json() as { count: number };
      browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
      browser.action.setBadgeBackgroundColor({ color: '#ef4444' });
    } catch {
      // silently fail
    }
  }

  async function getAuthToken(): Promise<string | null> {
    const result = await browser.storage.local.get('auth_token');
    return (result.auth_token as string) ?? null;
  }

  browser.alarms.create('pollReminders', { periodInMinutes: POLL_INTERVAL_MS / 60000 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'pollReminders') updateBadge();
  });

  updateBadge();
});
