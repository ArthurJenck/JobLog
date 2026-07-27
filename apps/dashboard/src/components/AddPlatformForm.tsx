import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { GlobeIcon, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function AddPlatformForm({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [faviconBroken, setFaviconBroken] = useState(false);
  const [step, setStep] = useState<'url' | 'name'>('url');
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function fetchMetadata() {
    if (!isValidUrl(url)) {
      toast.error('URL invalide');
      return;
    }
    setIsFetchingMeta(true);
    try {
      const meta = await api.platforms.metadata(url);
      setName(meta.name);
      setFaviconUrl(meta.faviconUrl);
      setDomain(meta.domain);
      setFaviconBroken(false);
      setStep('name');
    } catch {
      toast.error("Impossible de récupérer les informations de cette page");
    } finally {
      setIsFetchingMeta(false);
    }
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    try {
      await api.platforms.create({ url, name: trimmed, domain, faviconUrl });
      onAdded();
      setUrl('');
      setName('');
      setFaviconUrl(null);
      setDomain(null);
      setFaviconBroken(false);
      setStep('url');
    } catch {
      toast.error("Impossible d'ajouter cette plateforme");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="platform-url">
          URL de la liste de vos candidatures
        </label>
        <Input
          id="platform-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && step === 'url') fetchMetadata();
          }}
          placeholder="https://www.linkedin.com/my-items/saved-jobs/"
          disabled={step === 'name'}
        />
        <p className="text-xs text-muted-foreground">
          Collez l'URL de la page qui liste vos candidatures ou offres suivies, pas la page d'accueil du site.
        </p>
      </div>

      {step === 'url' && (
        <Button size="sm" onClick={fetchMetadata} disabled={!url || isFetchingMeta} className="self-start">
          {isFetchingMeta && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
          Suivant
        </Button>
      )}

      {step === 'name' && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="platform-name">
              Nom
            </label>
            <div className="flex items-center gap-2">
              {faviconUrl && !faviconBroken ? (
                <img
                  src={faviconUrl}
                  alt=""
                  className="h-5 w-5 rounded flex-shrink-0"
                  onError={() => setFaviconBroken(true)}
                />
              ) : (
                <GlobeIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
              <Input
                id="platform-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
                autoFocus
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={submit} disabled={!name.trim() || isSubmitting}>
              {isSubmitting && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
              Ajouter
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStep('url')} disabled={isSubmitting}>
              Retour
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
