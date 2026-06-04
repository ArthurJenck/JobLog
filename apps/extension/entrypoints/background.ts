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

  async function saveJobPosting(draft: JobPostingDraft): Promise<void> {
    const token = await getAuthToken();
    if (!token) throw new Error('Connectez-vous depuis la popup JobLog.');

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const jpRes = await fetch(`${API_BASE}/api/job-postings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...draft, scrape_method: 'extension' }),
    });
    if (!jpRes.ok) throw new Error(`Offre: HTTP ${jpRes.status}`);

    const { jobPostingId } = await jpRes.json() as { jobPostingId: string };

    const appRes = await fetch(`${API_BASE}/api/applications`, {
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
