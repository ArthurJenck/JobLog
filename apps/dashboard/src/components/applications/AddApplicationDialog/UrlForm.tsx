import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { localDayKey } from '@joblog/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { api, type FromUrlMeta, type UrlPasteUsage } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { UrlUsageNotice } from './UrlUsageNotice';
import { playError, playLoading } from '@/lib/sound';

// TODO: REMETTRE A true QUAND EXTENSION ACCEPTEE DANS LE CHROME WEB STORE
const SHOW_URL_USAGE_WARNING = false;

export function UrlForm({
  open,
  onCreated,
}: {
  open: boolean;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const usageQuery = useQuery({
    queryKey: qk.jobPostings.fromUrlUsage,
    queryFn: () => api.jobPostings.getFromUrlUsage(),
    enabled: open,
  });
  const usage = usageQuery.data?.usage ?? null;
  const extensionUrl = usageQuery.data?.extensionUrl ?? null;

  const createMutation = useMutation({
    mutationFn: (target: string) => api.jobPostings.createFromUrl(target),
    onSuccess: (result) => {
      qc.setQueryData<FromUrlMeta>(qk.jobPostings.fromUrlUsage, {
        usage: result.usage,
        extensionUrl: result.extensionUrl ?? null,
      });
      void qc.invalidateQueries({ queryKey: qk.applications.all });
      void qc.invalidateQueries({ queryKey: qk.stats });
      void qc.invalidateQueries({ queryKey: qk.tasks(localDayKey()) });
      onCreated(result.applicationId);
    },
    onError: (err) => {
      const apiErr = err as {
        usage?: UrlPasteUsage;
        extensionUrl?: string | null;
      };
      if (apiErr.usage) {
        qc.setQueryData<FromUrlMeta>(qk.jobPostings.fromUrlUsage, (prev) => ({
          usage: apiErr.usage!,
          extensionUrl:
            'extensionUrl' in apiErr
              ? apiErr.extensionUrl ?? null
              : prev?.extensionUrl ?? null,
        }));
      }
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(message);
      playError();
      toast.error('Récupération impossible', { description: message });
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (usage?.isBlocked) {
      const message = "Limite d'ajout par URL atteinte pour aujourd'hui.";
      setError(message);
      playError();
      toast.error('Récupération bloquée', { description: message });
      return;
    }

    setError('');
    playLoading();
    createMutation.mutate(url);
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
      <Button type="submit" disabled={createMutation.isPending} className="w-full">
        {createMutation.isPending ? 'Ajout…' : "Récupérer l'offre"}
      </Button>
    </form>
  );
}
