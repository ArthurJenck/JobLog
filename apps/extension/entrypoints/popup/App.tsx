import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://joblog.arthurjenck.com';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    browser.storage.local.get('auth_token').then(({ auth_token }) => {
      setIsLoggedIn(!!auth_token);
    });
  }, []);

  if (isLoggedIn === null) {
    return (
      <div className="popup-container loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="popup-container">
        <div className="logo">JL</div>
        <h1>JobLog</h1>
        <p>Connecte-toi pour sauvegarder des offres.</p>
        <a href={`${API_BASE}/login`} target="_blank" rel="noreferrer" className="btn-primary">
          Se connecter
        </a>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <div className="popup-header">
        <div className="logo">JL</div>
        <span>JobLog</span>
        <a href={`${API_BASE}`} target="_blank" rel="noreferrer" className="btn-icon" title="Ouvrir le dashboard">
          ↗
        </a>
      </div>
      <div className="popup-body">
        <p className="hint">Sur une offre supportée, un bouton apparaît sur la page.</p>
        <a href={`${API_BASE}?add=manual`} target="_blank" rel="noreferrer" className="btn-secondary">
          Ajouter manuellement
        </a>
      </div>
    </div>
  );
}
