import type { JobPostingDraft } from '@joblog/shared';

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://joblog.arthurjenck.com';

export async function saveJobPosting(draft: JobPostingDraft): Promise<void> {
  const { auth_token } = await browser.storage.local.get('auth_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth_token) headers['Authorization'] = `Bearer ${auth_token}`;

  const jpRes = await fetch(`${API_BASE}/api/job-postings`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(draft),
  });
  if (!jpRes.ok) throw new Error(`job-postings: ${jpRes.status}`);
  const { jobPostingId } = await jpRes.json() as { jobPostingId: string };

  const appRes = await fetch(`${API_BASE}/api/applications`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ jobPostingId, status: 'saved' }),
  });
  if (!appRes.ok) throw new Error(`applications: ${appRes.status}`);
}

export function injectSaveButton(extractor: () => JobPostingDraft): void {
  if (document.getElementById('joblog-save-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'joblog-save-btn';
  btn.textContent = '💼 Sauver dans JobLog';
  Object.assign(btn.style, {
    position: 'fixed',
    top: '80px',
    right: '20px',
    zIndex: '9999',
    background: '#0f0f0f',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    fontFamily: 'system-ui, sans-serif',
  });

  btn.addEventListener('click', async () => {
    btn.textContent = '…';
    btn.disabled = true;
    try {
      await saveJobPosting(extractor());
      btn.textContent = '✓ Sauvegardé';
      setTimeout(() => btn.remove(), 2000);
    } catch {
      btn.textContent = '✗ Erreur';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = '💼 Sauver dans JobLog'; }, 2000);
    }
  });

  document.body.appendChild(btn);
}

export function parseContractType(raw: string) {
  const r = raw.toLowerCase();
  if (r.includes('cdi')) return 'cdi' as const;
  if (r.includes('cdd')) return 'cdd' as const;
  if (r.includes('alternance') || r.includes('apprentissage')) return 'alternance' as const;
  if (r.includes('stage')) return 'stage' as const;
  if (r.includes('freelance') || r.includes('consultant')) return 'freelance' as const;
  return null;
}

export function parseRemote(raw: string) {
  const r = raw.toLowerCase();
  if (r.includes('télétravail complet') || r.includes('full remote') || r.includes('remote')) return 'remote' as const;
  if (r.includes('hybride')) return 'hybride' as const;
  if (r.includes('présentiel') || r.includes('sur site')) return 'présentiel' as const;
  return null;
}
