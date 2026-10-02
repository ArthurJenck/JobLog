import type {
  AdminFixtureCaptureResponse,
  AdminFixtureSession,
  AdminFixtureSessionResponse,
  CaptureMessageResponse,
  ExtensionCapturePayload,
  ExtensionCaptureResponse,
} from '../utils/capture-types';
import { API_BASE } from '../utils/api-base';

const POLL_INTERVAL_MINUTES = 30;

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (isCapturePageMessage(message)) {
      capturePage(message.payload).then(sendResponse);
      return true;
    }

    if (isGetAuthStatusMessage(message)) {
      verifyAuthentication().then((authenticated) => sendResponse({ authenticated }));
      return true;
    }

    if (isGetAdminFixtureSessionMessage(message)) {
      getAdminFixtureSession().then(sendResponse);
      return true;
    }

    if (isSendAdminFixtureMessage(message)) {
      sendAdminFixture(message.sessionId, message.payload).then(sendResponse);
      return true;
    }

    if (isOpenAuthMessage(message)) {
      openAuthPage().then(() => sendResponse({ ok: true }));
      return true;
    }
  });

  browser.alarms.create('pollReminders', { periodInMinutes: POLL_INTERVAL_MINUTES });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'pollReminders') updateBadge();
  });

  updateBadge();
});

async function capturePage(payload: ExtensionCapturePayload): Promise<CaptureMessageResponse> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/api/extension/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw await createHttpError(response, 'La sauvegarde a échoué.');

    const result = await response.json() as ExtensionCaptureResponse;
    if (result.status === 'manual_required') {
      await browser.tabs.create({
        url: result.handoffUrl ? toAppUrl(result.handoffUrl) : `${API_BASE}/?add=1`,
      });
    }
    return { ok: true, result };
  } catch (error) {
    if (isAuthenticationError(error)) {
      await openAuthPage();
      return { ok: false, code: 'auth_required', error: getErrorMessage(error) };
    }
    return { ok: false, code: 'capture_failed', error: getErrorMessage(error) };
  }
}

async function getAdminFixtureSession(): Promise<AdminFixtureSessionResponse> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/api/extension/admin-fixture-session`);
    if (response.status === 404 || response.status === 204) return { ok: true, session: null };
    if (!response.ok) throw await createHttpError(response, 'Impossible de vérifier la session de test admin.');

    const body = await response.json() as AdminFixtureSession | { session?: AdminFixtureSession | null };
    const session = isAdminFixtureSession(body) ? body : body.session ?? null;
    return { ok: true, session };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

async function sendAdminFixture(
  sessionId: string,
  payload: ExtensionCapturePayload,
): Promise<AdminFixtureCaptureResponse> {
  try {
    const response = await fetchWithAuth(
      `${API_BASE}/api/extension/admin-fixture-session/${encodeURIComponent(sessionId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) throw await createHttpError(response, 'L’envoi au test admin a échoué.');

    const body = await readOptionalJson(response) as { message?: string } | null;
    return { ok: true, message: body?.message };
  } catch (error) {
    if (isAuthenticationError(error)) {
      await openAuthPage();
      return { ok: false, code: 'auth_required', error: getErrorMessage(error) };
    }
    return { ok: false, code: 'capture_failed', error: getErrorMessage(error) };
  }
}

async function getAccessToken(): Promise<string | null> {
  const result = await browser.storage.local.get('access_token');
  return typeof result.access_token === 'string' ? result.access_token : null;
}

async function verifyAuthentication() {
  try {
    const response = await fetchWithAuth(`${API_BASE}/api/reminders/pending`);
    return response.ok;
  } catch {
    return false;
  }
}

async function attemptRefresh(): Promise<string | null> {
  const result = await browser.storage.local.get('refresh_token');
  const refreshToken = typeof result.refresh_token === 'string' ? result.refresh_token : null;
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE}/api/auth/extension-refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      await clearAuthentication();
      return null;
    }

    const data = await response.json() as { accessToken: string; refreshToken: string };
    await browser.storage.local.set({
      access_token: data.accessToken,
      refresh_token: data.refreshToken,
    });
    return data.accessToken;
  } catch {
    return null;
  }
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let token = await getAccessToken();
  if (!token) token = await attemptRefresh();
  if (!token) throw new AuthenticationError('Connectez-vous à JobLog pour continuer.');

  let response = await fetch(url, withBearerToken(options, token));
  if (response.status !== 401) return response;

  token = await attemptRefresh();
  if (!token) throw new AuthenticationError('Votre session a expiré. Reconnectez-vous à JobLog.');

  response = await fetch(url, withBearerToken(options, token));
  if (response.status === 401) {
    await clearAuthentication();
    throw new AuthenticationError('Votre session a expiré. Reconnectez-vous à JobLog.');
  }
  return response;
}

function withBearerToken(options: RequestInit, token: string): RequestInit {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...options, headers };
}

async function updateBadge() {
  try {
    const token = await getAccessToken();
    if (!token) {
      await browser.action.setBadgeText({ text: '' });
      return;
    }

    const response = await fetchWithAuth(`${API_BASE}/api/reminders/pending`);
    if (!response.ok) return;
    const { count } = await response.json() as { count: number };
    await browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    await browser.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } catch {
    await browser.action.setBadgeText({ text: '' });
  }
}

async function openAuthPage() {
  await browser.tabs.create({ url: `${API_BASE}/auth/connect` });
}

async function clearAuthentication() {
  await browser.storage.local.remove(['access_token', 'refresh_token']);
}

function toAppUrl(value: string) {
  try {
    return new URL(value, API_BASE).href;
  } catch {
    return `${API_BASE}/?add=1`;
  }
}

async function createHttpError(response: Response, fallback: string) {
  const body = await readOptionalJson(response) as { error?: string; message?: string } | null;
  return new Error(body?.error ?? body?.message ?? `${fallback} (HTTP ${response.status})`);
}

async function readOptionalJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isCapturePageMessage(message: unknown): message is {
  type: 'JOBLOG_CAPTURE_PAGE';
  payload: ExtensionCapturePayload;
} {
  return isMessageWithPayload(message, 'JOBLOG_CAPTURE_PAGE');
}

function isGetAuthStatusMessage(message: unknown): message is { type: 'JOBLOG_GET_AUTH_STATUS' } {
  return Boolean(
    message &&
    typeof message === 'object' &&
    'type' in message &&
    message.type === 'JOBLOG_GET_AUTH_STATUS'
  );
}

function isGetAdminFixtureSessionMessage(message: unknown): message is {
  type: 'JOBLOG_GET_ADMIN_FIXTURE_SESSION';
} {
  return Boolean(
    message &&
    typeof message === 'object' &&
    'type' in message &&
    message.type === 'JOBLOG_GET_ADMIN_FIXTURE_SESSION'
  );
}

function isSendAdminFixtureMessage(message: unknown): message is {
  type: 'JOBLOG_SEND_ADMIN_FIXTURE';
  sessionId: string;
  payload: ExtensionCapturePayload;
} {
  return Boolean(
    isMessageWithPayload(message, 'JOBLOG_SEND_ADMIN_FIXTURE') &&
    'sessionId' in message &&
    typeof message.sessionId === 'string'
  );
}

function isOpenAuthMessage(message: unknown): message is { type: 'JOBLOG_OPEN_AUTH' } {
  return Boolean(
    message &&
    typeof message === 'object' &&
    'type' in message &&
    message.type === 'JOBLOG_OPEN_AUTH'
  );
}

function isMessageWithPayload(
  message: unknown,
  type: 'JOBLOG_CAPTURE_PAGE' | 'JOBLOG_SEND_ADMIN_FIXTURE',
): message is { type: typeof type; payload: ExtensionCapturePayload } {
  return Boolean(
    message &&
    typeof message === 'object' &&
    'type' in message &&
    message.type === type &&
    'payload' in message &&
    message.payload &&
    typeof message.payload === 'object'
  );
}

class AuthenticationError extends Error {}

function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Erreur inconnue';
}

function isAdminFixtureSession(value: unknown): value is AdminFixtureSession {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string'
  );
}
