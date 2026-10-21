import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AutomationAccess() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/automation/key', { credentials: 'include' })
      .then((response) => {
        if (!response.ok) throw new Error('load failed');
        return response.json() as Promise<{ configured: boolean }>;
      })
      .then((data) => setConfigured(data.configured))
      .catch(() => toast.error("Impossible de charger l'accès n8n"));
  }, []);

  async function generate() {
    if (configured && !window.confirm('Régénérer la clé ? La clé utilisée par n8n cessera de fonctionner immédiatement.')) return;
    setBusy(true);
    try {
      const response = await fetch('/api/automation/key', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('generate failed');
      const data = await response.json() as { token: string };
      setToken(data.token);
      setConfigured(true);
    } catch {
      toast.error('Impossible de générer la clé n8n');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!window.confirm("Révoquer la clé ? Le workflow n8n perdra l'accès aux plateformes.")) return;
    setBusy(true);
    try {
      const response = await fetch('/api/automation/key', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('revoke failed');
      setToken('');
      setConfigured(false);
      toast.success('Clé n8n révoquée');
    } catch {
      toast.error('Impossible de révoquer la clé n8n');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      toast.success('Clé copiée');
    } catch {
      toast.error('Copie impossible, sélectionne la clé manuellement');
    }
  }

  return (
    <div className="rounded-lg border p-4 flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">Accès n8n aux plateformes</p>
        <p className="text-xs text-muted-foreground mt-1">
          Cette clé permet uniquement de lire la liste de tes plateformes. Elle ne permet pas de modifier JobLog.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {configured === null ? 'Chargement…' : configured ? 'Clé active' : 'Aucune clé active'}
      </p>
      {token && (
        <div className="flex flex-col gap-2">
          <p className="text-xs">Copie cette clé dans n8n maintenant. Elle ne sera plus affichée après avoir quitté cette page.</p>
          <Input value={token} readOnly autoComplete="off" spellCheck={false} aria-label="Clé n8n" />
          <Button variant="outline" size="sm" className="w-fit" onClick={copy}>Copier la clé</Button>
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={generate} disabled={busy || configured === null}>
          {configured ? 'Régénérer la clé' : 'Créer une clé'}
        </Button>
        {configured && (
          <Button variant="outline" size="sm" onClick={revoke} disabled={busy}>Révoquer</Button>
        )}
      </div>
    </div>
  );
}
