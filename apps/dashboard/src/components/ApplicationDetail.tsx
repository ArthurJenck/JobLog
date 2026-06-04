import { useState, useEffect } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from './StatusBadge';
import { SourceBadge } from './SourceBadge';
import { EventTimeline } from './EventTimeline';
import { AnalyzePanel } from './AnalyzePanel';
import { api } from '@/lib/api';
import { getCompanyLogoUrl } from '@/lib/company-logo';
import { APPLICATION_STATUSES, STATUS_LABELS, CONTRACT_LABELS, REMOTE_LABELS, type ApplicationWithJob, type ContractType, type RemoteType, type EventType, type Cv } from '@joblog/shared';
import { ExternalLinkIcon, BuildingIcon } from 'lucide-react';

interface Props {
  application: ApplicationWithJob | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function ApplicationDetail({ application, open, onClose, onUpdated }: Props) {
  const [cvs, setCvs] = useState<Omit<Cv, 'content'>[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      api.cvs.list().then((r) => setCvs(r.data)).catch(() => {});
    }
  }, [open]);

  if (!application) return null;

  const jp = application.jobPosting;
  const logoUrl = getCompanyLogoUrl(jp, 80);

  async function patch(body: Record<string, unknown>) {
    setIsSaving(true);
    try {
      await api.applications.patch(application!._id, body);
      onUpdated();
    } finally {
      setIsSaving(false);
    }
  }

  async function addEvent(type: EventType) {
    await api.applications.addEvent(application!._id, { type, at: new Date().toISOString() });
    onUpdated();
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-start gap-3">
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                className="h-10 w-10 rounded-lg object-contain flex-shrink-0 mt-0.5"
                referrerPolicy="origin"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            {!logoUrl && (
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <BuildingIcon className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight">{jp?.title ?? '—'}</SheetTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{jp?.company ?? '—'}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {jp?.source && <SourceBadge source={jp.source} />}
                {jp?.contract_type && (
                  <span className="text-xs text-muted-foreground">{CONTRACT_LABELS[jp.contract_type as ContractType] ?? jp.contract_type.toUpperCase()}</span>
                )}
                {jp?.remote && (
                  <span className="text-xs text-muted-foreground">{REMOTE_LABELS[jp.remote as RemoteType] ?? jp.remote}</span>
                )}
                {jp?.location && (
                  <span className="text-xs text-muted-foreground">{jp.location}</span>
                )}
                {jp?.url && (
                  <a href={jp.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <ExternalLinkIcon className="h-3 w-3" />
                    Offre
                  </a>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="px-6 py-4 flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Statut</span>
              <StatusBadge status={application.status} />
            </div>
            <Select
              value={application.status}
              onValueChange={(v) => patch({ status: v })}
              disabled={isSaving}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPLICATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {application.status !== 'applied' && (
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={async () => {
                  await patch({ status: 'applied', appliedAt: new Date().toISOString() });
                  const alreadyHasEvent = application.events.some((e) => e.type === 'applied');
                  if (!alreadyHasEvent) await addEvent('applied');
                }}
                disabled={isSaving}
              >
                Marquer comme postulée
              </Button>
            )}
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <span className="text-sm font-medium">CV associé</span>
            <Select
              value={application.cvId ?? '__none__'}
              onValueChange={(v) => patch({ cvId: v === '__none__' ? null : v })}
              disabled={isSaving}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Aucun CV associé" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Aucun CV</SelectItem>
                {cvs.map((cv) => (
                  <SelectItem key={cv._id} value={cv._id}>{cv.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {application.cvId && (
              <AnalyzePanel applicationId={application._id} cvId={application.cvId} />
            )}
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <span className="text-sm font-medium">Contact</span>
            <ContactFields
              contact={application.contact}
              onSave={(contact) => patch({ contact })}
            />
          </section>

          <Separator />

          <EventTimeline events={application.events} onAddEvent={addEvent} />

          <Separator />

          <section className="flex flex-col gap-3">
            <span className="text-sm font-medium">Notes</span>
            <NotesField
              value={application.notes ?? ''}
              onSave={(notes) => patch({ notes })}
            />
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <span className="text-sm font-medium">Relances</span>
            <ReminderFields reminder={application.reminder} onSave={(r) => patch({ reminder: r })} />
          </section>

          <Separator />

          <div className="flex justify-end pb-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (confirm('Supprimer cette candidature ?')) {
                  await api.applications.delete(application._id);
                  onUpdated();
                  onClose();
                }
              }}
            >
              Supprimer
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ContactFields({
  contact,
  onSave,
}: {
  contact: ApplicationWithJob['contact'];
  onSave: (c: ApplicationWithJob['contact']) => void;
}) {
  const [v, setV] = useState(contact ?? { name: null, role: null, email: null, phone: null });
  const [dirty, setDirty] = useState(false);

  function update(field: string, val: string) {
    setV((prev) => ({ ...prev, [field]: val || null }));
    setDirty(true);
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {(['name', 'role', 'email', 'phone'] as const).map((field) => (
        <div key={field} className="flex flex-col gap-1.5">
          <Label className="text-xs capitalize">{fieldLabel(field)}</Label>
          <Input
            value={v[field] ?? ''}
            onChange={(e) => update(field, e.target.value)}
            onBlur={() => { if (dirty) { onSave(v); setDirty(false); } }}
            className="h-8 text-sm"
            placeholder="—"
          />
        </div>
      ))}
    </div>
  );
}

function fieldLabel(f: string) {
  const map: Record<string, string> = { name: 'Nom', role: 'Poste', email: 'Email', phone: 'Téléphone' };
  return map[f] ?? f;
}

function NotesField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <Textarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(v)}
      placeholder="Notes libres…"
      className="resize-none text-sm min-h-24"
    />
  );
}

function ReminderFields({
  reminder,
  onSave,
}: {
  reminder: ApplicationWithJob['reminder'];
  onSave: (r: Partial<ApplicationWithJob['reminder']>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Date de relance</Label>
        <Input
          type="date"
          defaultValue={reminder.at ? new Date(reminder.at).toISOString().slice(0, 10) : ''}
          onChange={(e) => onSave({ at: e.target.value ? new Date(e.target.value).toISOString() : null })}
          className="h-8 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Fréquence (jours)</Label>
        <Input
          type="number"
          min={1}
          defaultValue={reminder.frequencyDays}
          onBlur={(e) => onSave({ frequencyDays: Number(e.target.value) || 7 })}
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
}
