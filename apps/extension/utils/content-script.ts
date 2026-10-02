import type { CaptureContext, CaptureMessageResponse } from './capture-types';
import { collectPageCapture } from './page-capture';

const CONSENT_STORAGE_KEY = 'capture_consent_accepted';
const BUTTON_HOST_ID = 'joblog-capture-host';

interface CaptureButtonOptions {
  sourceHint: string;
  shouldShow?: () => boolean;
  getNativeJobId?: () => string | null;
  getPreferredRootSelector?: () => string | undefined;
  getCaptureUrl?: () => string | undefined;
}

export function injectCaptureButton(options: CaptureButtonOptions): void {
  const syncButton = () => {
    const existing = document.getElementById(BUTTON_HOST_ID);

    if (options.shouldShow && !options.shouldShow()) {
      existing?.remove();
      return;
    }

    if (existing || !document.body) return;
    document.body.appendChild(createCaptureButton(options));
  };

  let pending = false;
  const scheduleSync = () => {
    if (pending) return;
    pending = true;
    window.setTimeout(() => {
      pending = false;
      syncButton();
    }, 150);
  };

  syncButton();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncButton, { once: true });
  }

  let previousPageIdentity = getPageIdentity(options);
  window.setInterval(() => {
    const nextPageIdentity = getPageIdentity(options);
    if (nextPageIdentity === previousPageIdentity) return;
    previousPageIdentity = nextPageIdentity;
    document.getElementById(BUTTON_HOST_ID)?.remove();
    scheduleSync();
  }, 400);

  new MutationObserver(scheduleSync).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function createCaptureButton(options: CaptureButtonOptions): HTMLElement {
  const host = document.createElement('div');
  host.id = BUTTON_HOST_ID;
  Object.assign(host.style, {
    all: 'initial',
    position: 'fixed',
    top: '80px',
    right: '20px',
    zIndex: '2147483647',
  });

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    button {
      appearance: none;
      background: #0f0f0f;
      border: 0;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, .24);
      color: #fff;
      cursor: pointer;
      font: 500 13px/1.2 system-ui, -apple-system, sans-serif;
      max-width: 220px;
      padding: 11px 16px;
      white-space: nowrap;
    }
    button:disabled { cursor: default; opacity: .78; }
  `;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '💼 Sauvegarder dans JobLog';
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Préparation…';

    try {
      const authStatus = await browser.runtime.sendMessage({
        type: 'JOBLOG_GET_AUTH_STATUS',
      }) as { authenticated?: boolean } | undefined;
      if (!authStatus?.authenticated) {
        await browser.runtime.sendMessage({ type: 'JOBLOG_OPEN_AUTH' });
        button.textContent = 'Connexion ouverte';
        return;
      }

      const hasConsent = await ensureCaptureConsent();
      if (!hasConsent) {
        button.textContent = 'Consentement requis';
        return;
      }

      const nativeJobId = options.getNativeJobId?.()?.trim().slice(0, 300) || undefined;
      const captureContext: CaptureContext = {
        sourceHint: options.sourceHint,
        ...(nativeJobId ? { nativeJobId } : {}),
        panelDetected: Boolean(options.getPreferredRootSelector?.()),
      };
      const payload = collectPageCapture({
        preferredRootSelector: options.getPreferredRootSelector?.(),
        captureContext,
      });
      const captureUrl = normalizeCaptureUrl(options.getCaptureUrl?.());
      if (captureUrl) {
        payload.url = captureUrl;
        payload.canonicalUrl = captureUrl;
      }

      button.textContent = 'Envoi…';
      const response = await browser.runtime.sendMessage({
        type: 'JOBLOG_CAPTURE_PAGE',
        payload,
      }) as CaptureMessageResponse | undefined;

      if (!response?.ok) throw new Error(response?.error ?? 'La capture a échoué.');

      button.textContent = getResultLabel(response.result.status);
      if (response.result.status !== 'manual_required') {
        window.setTimeout(() => host.remove(), 2200);
      }
    } catch (error) {
      button.textContent = formatButtonError(error);
    } finally {
      if (host.isConnected) {
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = '💼 Sauvegarder dans JobLog';
        }, 2400);
      }
    }
  });

  shadow.append(style, button);
  return host;
}

async function ensureCaptureConsent() {
  const stored = await browser.storage.local.get(CONSENT_STORAGE_KEY);
  if (stored[CONSENT_STORAGE_KEY] === true) return true;

  const accepted = window.confirm(
    'JobLog va envoyer le contenu utile et nettoyé de cette page pour extraire l’offre. Un extrait nettoyé peut être transmis à Gemini uniquement en dernier recours. Aucune valeur de formulaire ni capture d’écran n’est envoyée.',
  );
  if (accepted) await browser.storage.local.set({ [CONSENT_STORAGE_KEY]: true });
  return accepted;
}

function getPageIdentity(options: CaptureButtonOptions) {
  return `${window.location.href}\0${options.getNativeJobId?.() ?? ''}`;
}

function getResultLabel(status: 'saved' | 'already_exists' | 'manual_required') {
  if (status === 'already_exists') return '✓ Déjà sauvegardée';
  if (status === 'manual_required') return '↗ Saisie manuelle requise';
  return '✓ Sauvegardée';
}

function formatButtonError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/connect|session|auth/i.test(message)) return 'Connexion requise';
  return 'Erreur, réessayer';
}

function normalizeCaptureUrl(rawUrl?: string) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return null;
    url.username = '';
    url.password = '';
    url.hash = '';
    return url.href.length <= 4_000 ? url.href : null;
  } catch {
    return null;
  }
}
