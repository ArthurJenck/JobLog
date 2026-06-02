import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
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
        <Tabs defaultValue="manual">
          <TabsList className="w-full">
            <TabsTrigger value="manual" className="flex-1">Saisie manuelle</TabsTrigger>
            <TabsTrigger value="url" className="flex-1">Coller une URL</TabsTrigger>
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
  const [form, setForm] = useState({
    title: '',
    company: '',
    location: '',
    url: '',
    contract_type: '',
    remote: '',
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

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
        contract_type: form.contract_type || null,
        remote: form.remote || null,
        scrape_method: 'manual',
      });
      const appRes = await api.applications.create({ jobPostingId: jpRes.jobPostingId });
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
          <Input value={form.title} onChange={(e) => set('title', e.target.value)} required placeholder="Développeur Frontend" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Entreprise *</Label>
          <Input value={form.company} onChange={(e) => set('company', e.target.value)} required placeholder="Acme Corp" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Lieu</Label>
          <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Paris, France" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>URL de l'offre</Label>
          <Input value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" type="url" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Contrat</Label>
          <Select value={form.contract_type} onValueChange={(v) => set('contract_type', v)}>
            <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">—</SelectItem>
              {CONTRACT_TYPES.map((c) => <SelectItem key={c} value={c}>{c.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Remote</Label>
          <Select value={form.remote} onValueChange={(v) => set('remote', v)}>
            <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">—</SelectItem>
              {REMOTE_TYPES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
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
      const jobPostingId = jp._id as string ?? jp.jobPostingId as string;
      const appRes = await api.applications.create({ jobPostingId });
      onCreated(appRes.applicationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
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
        {isLoading ? 'Analyse en cours…' : 'Récupérer l\'offre'}
      </Button>
    </form>
  );
}
