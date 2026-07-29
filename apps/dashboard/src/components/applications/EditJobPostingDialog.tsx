import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { JobPostingFields } from '@/components/applications/JobPostingFields';
import type { ApplicationWithJob } from '@joblog/shared';

interface Props {
  application: ApplicationWithJob;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EditJobPostingDialog({ application, open, onClose, onSaved }: Props) {
  const jp = application.jobPosting;

  const [company, setCompany] = useState(jp?.company ?? '');
  const [form, setForm] = useState({
    title: jp?.title ?? '',
    location: jp?.location ?? '',
    url: jp?.url ?? '',
    contract_type: jp?.contract_type ?? '',
    remote: jp?.remote ?? '',
  });
  const [urlError, setUrlError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'url') setUrlError('');
  }

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
    if (!form.title.trim() || !company.trim()) return;

    if (!validateUrl(form.url)) {
      setUrlError('URL invalide');
      return;
    }
    setUrlError('');

    setLoading(true);
    try {
      await api.applications.patch(application._id, {
        jobPosting: {
          title: form.title.trim(),
          company: company.trim(),
          location: form.location.trim() || null,
          contract_type: form.contract_type || null,
          remote: form.remote || null,
          url: form.url.trim() || undefined,
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
          <JobPostingFields
            compact
            values={form}
            onChange={(field, value) => set(field, value)}
            urlError={urlError}
            renderCompanyField={() => (
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Corp"
                className="h-8 text-sm"
                required
              />
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={loading || !form.title.trim() || !company.trim()}>
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
