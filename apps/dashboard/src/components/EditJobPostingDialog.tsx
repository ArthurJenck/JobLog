import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import {
  CONTRACT_TYPES, CONTRACT_LABELS, REMOTE_TYPES, REMOTE_LABELS,
  type ApplicationWithJob, type ContractType, type RemoteType,
} from '@joblog/shared';

interface Props {
  application: ApplicationWithJob;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EditJobPostingDialog({ application, open, onClose, onSaved }: Props) {
  const jp = application.jobPosting;

  const [title, setTitle] = useState(jp?.title ?? '');
  const [company, setCompany] = useState(jp?.company ?? '');
  const [location, setLocation] = useState(jp?.location ?? '');
  const [contractType, setContractType] = useState<ContractType | ''>(jp?.contract_type ?? '');
  const [remote, setRemote] = useState<RemoteType | ''>(jp?.remote ?? '');
  const [url, setUrl] = useState(jp?.url ?? '');
  const [urlError, setUrlError] = useState('');
  const [loading, setLoading] = useState(false);

  function validateUrl(value: string): boolean {
    if (!value) return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !company.trim()) return;

    if (!validateUrl(url)) {
      setUrlError('URL invalide');
      return;
    }
    setUrlError('');

    setLoading(true);
    try {
      await api.applications.patch(application._id, {
        jobPosting: {
          title: title.trim(),
          company: company.trim(),
          location: location.trim() || null,
          contract_type: contractType || null,
          remote: remote || null,
          url: url.trim() || undefined,
        },
      });
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier l'offre</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Poste *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Développeur Frontend"
                className="h-8 text-sm"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Entreprise *</Label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Corp"
                className="h-8 text-sm"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Lieu</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Paris, France"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Contrat</Label>
              <Select
                value={contractType}
                onValueChange={(v) => setContractType(v === '__none__' ? '' : v as ContractType)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {CONTRACT_TYPES.map((c) => (
                    <SelectItem key={c} value={c}>{CONTRACT_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Remote</Label>
              <Select
                value={remote}
                onValueChange={(v) => setRemote(v === '__none__' ? '' : v as RemoteType)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {REMOTE_TYPES.map((r) => (
                    <SelectItem key={r} value={r}>{REMOTE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">URL de l'offre</Label>
              <Input
                value={url}
                onChange={(e) => { setUrl(e.target.value); setUrlError(''); }}
                placeholder="https://…"
                className="h-8 text-sm"
              />
              {urlError && <p className="text-xs text-destructive">{urlError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={loading || !title.trim() || !company.trim()}>
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
