import { useEffect, useState } from 'react';
import { API_BASE } from '../../utils/api-base';

interface RecentApp {
  _id: string;
  status: string;
  jobPosting?: { title: string; company: string } | null;
}

export default function App() {
  const [authToken, setAuthToken] = useState<string | null | undefined>(undefined);
  const [recent, setRecent] = useState<RecentApp[]>([]);

  useEffect(() => {
    browser.storage.local.get('access_token').then(({ access_token }) => {
      setAuthToken((access_token as string) ?? null);
    });

    const listener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>) => {
      if ('access_token' in changes) {
        setAuthToken((changes.access_token.newValue as string | undefined) ?? null);
      }
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE}/api/applications?limit=5`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data?.data && setRecent(data.data))
      .catch(() => {});
  }, [authToken]);

  if (authToken === undefined) {
    return (
      <div className="popup loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!authToken) {
    return (
      <div className="popup">
        <div className="header">
          <div className="logo">JL</div>
          <span className="title">JobLog</span>
        </div>
        <p className="hint">Connecte-toi pour sauvegarder des offres.</p>
        <a href={`${API_BASE}/auth/connect`} target="_blank" rel="noreferrer" className="btn-primary">
          Se connecter
        </a>
      </div>
    );
  }

  return (
    <div className="popup">
      <div className="header">
        <div className="logo">JL</div>
        <span className="title">JobLog</span>
        <a
          href={`${API_BASE}`}
          target="_blank"
          rel="noreferrer"
          className="icon-link"
          title="Ouvrir le dashboard"
        >
          ↗
        </a>
      </div>

      {recent.length > 0 && (
        <div className="recent">
          <p className="section-label">Récentes</p>
          {recent.map((app) => (
            <a
              key={app._id}
              href={`${API_BASE}`}
              target="_blank"
              rel="noreferrer"
              className="recent-item"
            >
              <span className="recent-title">{app.jobPosting?.title ?? '—'}</span>
              <span className="recent-company">{app.jobPosting?.company ?? '—'}</span>
              <span className={`status-dot status-${app.status}`} />
            </a>
          ))}
        </div>
      )}

      <div className="actions">
        <p className="hint">Sur un site supporté, un bouton apparaît automatiquement.</p>
        <a
          href={`${API_BASE}?add=1`}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
        >
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
      </div>
    </div>
  );
}
