import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { api, type LogoSearchResult } from '@/lib/api';
import { getLogoUrlForDomain } from '@/lib/company-logo';
import { CONTRACT_TYPES, REMOTE_TYPES } from '@joblog/shared';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (applicationId: string) => void;
}

export function AddApplicationDialog({ open, onClose, onCreated }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter une candidature</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="url">
          <TabsList className="w-full">
            <TabsTrigger value="url" className="flex-1">
              Coller une URL
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex-1">
              Saisie manuelle
            </TabsTrigger>
          </TabsList>
          <TabsContent value="manual">
            <ManualForm onCreated={onCreated} />
          </TabsContent>
          <TabsContent value="url">
            <UrlForm onCreated={onCreated} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ManualForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [companyMatches, setCompanyMatches] = useState<LogoSearchResult[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<LogoSearchResult | null>(null);
  const [isCompanyFocused, setIsCompanyFocused] = useState(false);
  const [isSearchingCompany, setIsSearchingCompany] = useState(false);
  const [form, setForm] = useState({
    title: '',
    company: '',
    company_website: '',
    location: '',
    url: '',
    contract_type: '',
    remote: '',
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setCompany(value: string) {
    setSelectedCompany(null);
    setCompanyMatches([]);
    setForm((prev) => ({ ...prev, company: value, company_website: '' }));
  }

  function selectCompany(match: LogoSearchResult) {
    setSelectedCompany(match);
    setCompanyMatches([]);
    setIsCompanyFocused(false);
    setForm((prev) => ({ ...prev, company: match.name, company_website: match.domain }));
  }

  useEffect(() => {
    const query = form.company.trim();

    if (query.length < 2 || selectedCompany?.name === query) {
      setCompanyMatches([]);
      setIsSearchingCompany(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearchingCompany(true);
      try {
        const { data } = await api.logos.search(query);
        if (!cancelled) setCompanyMatches(data);
      } catch {
        if (!cancelled) setCompanyMatches([]);
      } finally {
        if (!cancelled) setIsSearchingCompany(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.company, selectedCompany?.name]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const jpRes = await api.jobPostings.create({
        url: form.url || `manual://joblog/${Date.now()}`,
        source: 'manual',
        title: form.title,
        company: form.company,
        location: form.location || null,
        company_website: form.company_website || null,
        contract_type: form.contract_type || null,
        remote: form.remote || null,
        scrape_method: 'manual',
      });
      const appRes = await api.applications.create({
        jobPostingId: jpRes.jobPostingId,
      });
      onCreated(appRes.applicationId);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 mt-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Poste *</Label>
          <Input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            required
            placeholder="Développeur Frontend"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Entreprise *</Label>
          <div className="relative">
            <Input
              value={form.company}
              onChange={(e) => setCompany(e.target.value)}
              onFocus={() => setIsCompanyFocused(true)}
              onBlur={() => window.setTimeout(() => setIsCompanyFocused(false), 120)}
              required
              placeholder="Acme Corp"
              autoComplete="off"
            />
            {isCompanyFocused && (companyMatches.length > 0 || isSearchingCompany) && !selectedCompany && (
              <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-20 overflow-hidden rounded-md border bg-popover shadow-md">
                {isSearchingCompany && companyMatches.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Recherche…</div>
                )}
                {companyMatches.map((match) => {
                  const logoUrl = getLogoUrlForDomain(match.domain, 32);

                  return (
                    <button
                      key={match.domain}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectCompany(match);
                      }}
                    >
                      {logoUrl && (
                        <img
                          src={logoUrl}
                          alt=""
                          className="h-5 w-5 rounded object-contain"
                          referrerPolicy="origin"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">{match.name}</span>
                      <span className="text-xs text-muted-foreground">{match.domain}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {selectedCompany && (
            <span className="text-xs text-muted-foreground">Domaine: {selectedCompany.domain}</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Lieu</Label>
          <Input
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="Paris, France"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>URL de l'offre</Label>
          <Input
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder="https://…"
            type="url"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Contrat</Label>
          <Select
            value={form.contract_type}
            onValueChange={(v) => set('contract_type', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choisir…" />
            </SelectTrigger>
            <SelectContent>
              {CONTRACT_TYPES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Remote</Label>
          <Select value={form.remote} onValueChange={(v) => set('remote', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir…" />
            </SelectTrigger>
            <SelectContent>
              {REMOTE_TYPES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? 'Enregistrement…' : 'Ajouter'}
      </Button>
    </form>
  );
}

function UrlForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const jp = await api.jobPostings.fromUrl(url);
      const jobPostingId = (jp._id as string) ?? (jp.jobPostingId as string);
      const appRes = await api.applications.create({ jobPostingId });
      onCreated(appRes.applicationId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(message);
      toast.error('Récupération impossible', { description: message });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 mt-4">
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
      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? 'Analyse en cours…' : "Récupérer l'offre"}
      </Button>
    </form>
  );
}
