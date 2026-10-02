import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { JobPostingFields } from '@/components/applications/JobPostingFields';
import type { ApplicationWithJob } from '@joblog/shared';
import type { JobPostingPatch } from '@/lib/optimistic-application';

interface Props {
  application: ApplicationWithJob;
  open: boolean;
  onClose: () => void;
  onSave: (patch: JobPostingPatch) => Promise<ApplicationWithJob>;
}

export function EditJobPostingDialog({
  application,
  open,
  onClose,
  onSave,
}: Props) {
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !company.trim()) return;

    if (!validateUrl(form.url)) {
      setUrlError('URL invalide');
      return;
    }
    setUrlError('');

    const patch: JobPostingPatch = {
      title: form.title.trim(),
      company: company.trim(),
      location: form.location.trim() || null,
      contract_type:
        (form.contract_type as ApplicationWithJob['jobPosting']['contract_type']) ||
        null,
      remote:
        (form.remote as ApplicationWithJob['jobPosting']['remote']) || null,
    };
    if (form.url.trim()) patch.url = form.url.trim();
    void onSave(patch).catch(() => undefined);
    onClose();
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
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={!form.title.trim() || !company.trim()}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
