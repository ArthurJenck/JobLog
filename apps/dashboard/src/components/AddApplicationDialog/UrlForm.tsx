import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { api, type UrlPasteUsage } from '@/lib/api';
import { UrlUsageNotice } from './UrlUsageNotice';

// TODO: REMETTRE A true QUAND EXTENSION ACCEPTEE DANS LE CHROME WEB STORE
const SHOW_URL_USAGE_WARNING = false;

export function UrlForm({
  open,
  onCreated,
}: {
  open: boolean;
  onCreated: (id: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState<UrlPasteUsage | null>(null);
  const [extensionUrl, setExtensionUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    api.jobPostings.getFromUrlUsage()
      .then((data) => {
        if (cancelled) return;
        setUsage(data.usage);
        setExtensionUrl(data.extensionUrl);
      })
      .catch(() => {
        if (!cancelled) setUsage(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (usage?.isBlocked) {
      const message = "Limite d'ajout par URL atteinte pour aujourd'hui.";
      setError(message);
      toast.error('Récupération bloquée', { description: message });
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      const result = await api.jobPostings.createFromUrl(url);
      setUsage(result.usage);
      setExtensionUrl(result.extensionUrl ?? null);
      onCreated(result.applicationId);
    } catch (err) {
      const apiErr = err as {
        usage?: UrlPasteUsage;
        extensionUrl?: string | null;
      };
      if (apiErr.usage) setUsage(apiErr.usage);
      if ('extensionUrl' in apiErr) setExtensionUrl(apiErr.extensionUrl ?? null);

      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(message);
      toast.error('Récupération impossible', { description: message });
    } finally {
      setIsLoading(false);
    }
  }

  if (usage?.isBlocked) {
    return (
      <div className="flex flex-col gap-4 mt-4">
        <UrlUsageNotice usage={usage} extensionUrl={extensionUrl} />
        {extensionUrl && (
          <Button type="button" variant="outline" className="w-full" asChild>
            <a href={extensionUrl} target="_blank" rel="noreferrer">
              Installer l'extension
            </a>
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 mt-4">
      {SHOW_URL_USAGE_WARNING && usage?.shouldWarn && (
        <UrlUsageNotice usage={usage} extensionUrl={extensionUrl} />
      )}
      <div className="flex flex-col gap-1.5">
        <Label>URL de l'offre</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          type="url"
          placeholder="https://www.welcometothejungle.com/…"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        type="submit"
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? 'Ajout…' : "Récupérer l'offre"}
      </Button>
    </form>
  );
}
