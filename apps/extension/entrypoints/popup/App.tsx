import { useEffect, useState } from 'react';
import type {
  AdminFixtureCaptureResponse,
  AdminFixtureSession,
  AdminFixtureSessionResponse,
  CaptureMessageResponse,
  ExtensionCapturePayload,
  ExtensionCaptureStatus,
} from '../../utils/capture-types';
import { API_BASE } from '../../utils/api-base';
import { collectPageCapture } from '../../utils/page-capture';

const CONSENT_STORAGE_KEY = 'capture_consent_accepted';

interface RecentApp {
  _id: string;
  status: string;
  jobPosting?: { title: string; company: string } | null;
}

type ActionState =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'success'; label: string }
  | { kind: 'error'; label: string };

export default function App() {
  const [authToken, setAuthToken] = useState<string | null | undefined>(undefined);
  const [recent, setRecent] = useState<RecentApp[]>([]);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentIntent, setConsentIntent] = useState<'save' | 'fixture' | 'settings' | null>(null);
  const [adminSession, setAdminSession] = useState<AdminFixtureSession | null>(null);
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });

  useEffect(() => {
    browser.runtime.sendMessage({ type: 'JOBLOG_GET_AUTH_STATUS' })
      .then(async (response: { authenticated?: boolean } | undefined) => {
        const stored = await browser.storage.local.get(['access_token', CONSENT_STORAGE_KEY]);
        setAuthToken(
          response?.authenticated && typeof stored.access_token === 'string'
            ? stored.access_token
            : null,
        );
        setConsentAccepted(stored[CONSENT_STORAGE_KEY] === true);
      })
      .catch(() => setAuthToken(null));

    const listener = (changes: Record<string, { newValue?: unknown }>) => {
      if ('access_token' in changes) {
        setAuthToken(typeof changes.access_token.newValue === 'string'
          ? changes.access_token.newValue
          : null);
      }
      if (CONSENT_STORAGE_KEY in changes) {
        setConsentAccepted(changes[CONSENT_STORAGE_KEY].newValue === true);
      }
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!authToken) {
      setRecent([]);
      setAdminSession(null);
      return;
    }

    fetch(`${API_BASE}/api/applications?limit=5`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data?.data && setRecent(data.data))
      .catch(() => {});

    browser.runtime.sendMessage({ type: 'JOBLOG_GET_ADMIN_FIXTURE_SESSION' })
      .then((response: AdminFixtureSessionResponse | undefined) => {
        if (response?.ok) setAdminSession(response.session);
      })
      .catch(() => {});
  }, [authToken]);

  const captureCurrentPage = async (target: 'save' | 'fixture', skipConsentCheck = false) => {
    const authStatus = await browser.runtime.sendMessage({ type: 'JOBLOG_GET_AUTH_STATUS' }) as
      | { authenticated?: boolean }
      | undefined;
    if (!authToken || !authStatus?.authenticated) {
      await browser.runtime.sendMessage({ type: 'JOBLOG_OPEN_AUTH' });
      window.close();
      return;
    }

    if (!consentAccepted && !skipConsentCheck) {
      setConsentIntent(target);
      return;
    }

    setAction({ kind: 'working', label: 'Préparation de la page…' });
    try {
      const payload = await captureActiveTab();
      setAction({ kind: 'working', label: target === 'fixture' ? 'Envoi au test admin…' : 'Sauvegarde…' });

      if (target === 'fixture') {
        if (!adminSession) throw new Error('La session de test admin a expiré.');
        const response = await browser.runtime.sendMessage({
          type: 'JOBLOG_SEND_ADMIN_FIXTURE',
          sessionId: adminSession.id,
          payload,
        }) as AdminFixtureCaptureResponse | undefined;
        if (!response?.ok) throw new Error(response?.error ?? 'L’envoi a échoué.');
        setAction({ kind: 'success', label: response.message ?? 'Snapshot envoyé au test admin.' });
        return;
      }

      const response = await browser.runtime.sendMessage({
        type: 'JOBLOG_CAPTURE_PAGE',
        payload,
      }) as CaptureMessageResponse | undefined;
      if (!response?.ok) throw new Error(response?.error ?? 'La sauvegarde a échoué.');
      setAction({ kind: 'success', label: formatCaptureResult(response.result.status) });
    } catch (error) {
      setAction({
        kind: 'error',
        label: error instanceof Error ? error.message : 'La capture a échoué.',
      });
    }
  };

  const acceptConsentAndCapture = async () => {
    const captureTarget = consentIntent === 'save' || consentIntent === 'fixture'
      ? consentIntent
      : null;
    await browser.storage.local.set({ [CONSENT_STORAGE_KEY]: true });
    setConsentAccepted(true);
    setConsentIntent(null);
    if (captureTarget) await captureCurrentPage(captureTarget, true);
  };

  const updateConsent = async (accepted: boolean) => {
    if (accepted) {
      setConsentIntent('settings');
      return;
    }
    await browser.storage.local.remove(CONSENT_STORAGE_KEY);
    setConsentAccepted(false);
  };

  if (authToken === undefined) {
    return (
      <div className="popup loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="popup">
      <div className="header">
        <img src="/icon-cropped.svg" alt="Logo JobLog" className="logo" />
        <span className="title">JobLog</span>
        {authToken && (
          <a
            href={API_BASE}
            target="_blank"
            rel="noreferrer"
            className="icon-link"
            title="Ouvrir le dashboard"
          >
            ↗
          </a>
        )}
      </div>

      {!authToken && (
        <p className="hint">La sauvegarde ouvrira la connexion JobLog dans un nouvel onglet.</p>
      )}

      {consentIntent && (
        <div className="consent-panel" role="dialog" aria-label="Consentement à la capture">
          <p className="consent-title">Avant la première capture</p>
          <p>
            Le contenu utile et nettoyé de la page sera envoyé à JobLog. Un extrait nettoyé peut être
            transmis à Gemini uniquement en dernier recours. Les formulaires, champs cachés et captures
            d’écran ne sont jamais envoyés.
          </p>
          <div className="consent-actions">
            <button className="btn-primary" onClick={acceptConsentAndCapture}>
              {consentIntent === 'save'
                ? 'J’accepte et je sauvegarde'
                : consentIntent === 'fixture'
                  ? 'J’accepte et j’envoie au test'
                  : 'J’accepte'}
            </button>
            <button className="btn-ghost" onClick={() => setConsentIntent(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {!consentIntent && (
        <button
          className="btn-primary"
          disabled={action.kind === 'working'}
          onClick={() => captureCurrentPage('save')}
        >
          {action.kind === 'working' ? action.label : 'Sauvegarder cette page'}
        </button>
      )}

      {action.kind !== 'idle' && action.kind !== 'working' && (
        <p className={`result result-${action.kind}`} role="status">{action.label}</p>
      )}

      {authToken && adminSession && (
        <button
          className="btn-admin"
          disabled={action.kind === 'working'}
          onClick={() => captureCurrentPage('fixture')}
        >
          Envoyer au test admin
        </button>
      )}

      {authToken && recent.length > 0 && (
        <div className="recent">
          <p className="section-label">Récentes</p>
          {recent.map((app) => (
            <a
              key={app._id}
              href={API_BASE}
              target="_blank"
              rel="noreferrer"
              className="recent-item"
            >
              <span className="recent-title">{app.jobPosting?.title ?? 'Sans titre'}</span>
              <span className="recent-company">{app.jobPosting?.company ?? 'Entreprise inconnue'}</span>
              <span className={`status-dot status-${app.status}`} />
            </a>
          ))}
        </div>
      )}

      <div className="settings">
        <label className="consent-setting">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(event) => updateConsent(event.target.checked)}
          />
          <span>Autoriser l’envoi de pages nettoyées</span>
        </label>
        <p className="setting-help">Désactive ce réglage pour redemander ton accord à la prochaine capture.</p>
      </div>

      <div className="actions">
        {authToken ? (
          <>
            <a href={`${API_BASE}?add=1`} target="_blank" rel="noreferrer" className="btn-secondary">
              + Ajouter manuellement
            </a>
            <button
              className="btn-ghost"
              onClick={async () => {
                await browser.storage.local.remove(['access_token', 'refresh_token']);
                setAuthToken(null);
              }}
            >
              Déconnexion
            </button>
          </>
        ) : (
          <button
            className="btn-secondary"
            onClick={() => browser.runtime.sendMessage({ type: 'JOBLOG_OPEN_AUTH' }).then(() => window.close())}
          >
            Se connecter
          </button>
        )}
      </div>
    </div>
  );
}

async function captureActiveTab(): Promise<ExtensionCapturePayload> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error('Aucun onglet actif accessible.');

  const url = new URL(tab.url);
  if (url.protocol !== 'https:') {
    throw new Error('La capture est disponible uniquement sur les pages HTTPS.');
  }

  const results = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: collectPageCapture,
    args: [{}],
  });
  const payload = results[0]?.result;
  if (!payload) throw new Error('Impossible de lire cette page.');
  return payload;
}

function formatCaptureResult(status: ExtensionCaptureStatus) {
  if (status === 'already_exists') return 'Cette offre est déjà dans JobLog.';
  if (status === 'manual_required') return 'Le formulaire manuel a été ouvert dans un nouvel onglet.';
  return 'Offre sauvegardée dans JobLog.';
}
