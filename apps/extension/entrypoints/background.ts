import type { JobPostingDraft } from '@joblog/shared';
import { API_BASE } from '../utils/api-base';

export default defineBackground(() => {
  const POLL_INTERVAL_MS = 30 * 60 * 1000;

  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isSaveJobMessage(message)) return;

    saveJobPosting(message.draft)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));

    return true;
  });

  async function getAccessToken(): Promise<string | null> {
    const result = await browser.storage.local.get('access_token');
    return (result.access_token as string) ?? null;
  }

  async function attemptRefresh(): Promise<string | null> {
    const result = await browser.storage.local.get('refresh_token');
    const refreshToken = result.refresh_token as string | undefined;
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${API_BASE}/api/auth/extension-refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        await browser.storage.local.remove(['access_token', 'refresh_token']);
        return null;
      }

      const data = await res.json() as { accessToken: string; refreshToken: string };
      await browser.storage.local.set({ access_token: data.accessToken, refresh_token: data.refreshToken });
      return data.accessToken;
    } catch {
      return null;
    }
  }

  async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    let token = await getAccessToken();
    if (!token) throw new Error('Connectez-vous depuis la popup JobLog.');

    const res = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      token = await attemptRefresh();
      if (!token) throw new Error('Session expirée. Reconnectez-vous depuis la popup JobLog.');
      return fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${token}` },
      });
    }

    return res;
  }

  async function updateBadge() {
    try {
      const token = await getAccessToken();
      if (!token) {
        browser.action.setBadgeText({ text: '' });
        return;
      }
      const res = await fetchWithAuth(`${API_BASE}/api/reminders/pending`);
      if (!res.ok) return;
      const { count } = await res.json() as { count: number };
      browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
      browser.action.setBadgeBackgroundColor({ color: '#ef4444' });
    } catch {
      // silently fail
    }
  }

  async function saveJobPosting(draft: JobPostingDraft): Promise<void> {
    const headers = { 'Content-Type': 'application/json' };

    const jpRes = await fetchWithAuth(`${API_BASE}/api/job-postings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...draft, scrape_method: 'extension' }),
    });
    if (!jpRes.ok) throw new Error(`Offre: HTTP ${jpRes.status}`);

    const { jobPostingId } = await jpRes.json() as { jobPostingId: string };

    const appRes = await fetchWithAuth(`${API_BASE}/api/applications`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jobPostingId, status: 'saved' }),
    });
    if (!appRes.ok) throw new Error(`Candidature: HTTP ${appRes.status}`);
  }

  function isSaveJobMessage(message: unknown): message is { type: 'JOBLOG_SAVE_JOB'; draft: JobPostingDraft } {
    return Boolean(
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'JOBLOG_SAVE_JOB' &&
      'draft' in message &&
      message.draft &&
      typeof message.draft === 'object'
    );
  }

  function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Erreur inconnue';
  }

  browser.alarms.create('pollReminders', { periodInMinutes: POLL_INTERVAL_MS / 60000 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'pollReminders') updateBadge();
  });

  updateBadge();
});
