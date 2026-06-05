import { useState, useEffect } from 'react';
import {
  Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from './StatusBadge';
import { SourceBadge } from './SourceBadge';
import { EventTimeline } from './EventTimeline';
import { ScrapeProgressTimeline } from './ScrapeProgressTimeline';
import { AnalyzePanel } from './AnalyzePanel';
import { EditJobPostingDialog } from './EditJobPostingDialog';
import { api } from '@/lib/api';
import { getCompanyLogoUrl } from '@/lib/company-logo';
import { getJobScrapeStatus } from '@/lib/scrape';
import { toast } from 'sonner';
import {
  APPLICATION_STATUSES, STATUS_LABELS, CONTRACT_LABELS, REMOTE_LABELS,
  STATUS_EVENT, TERMINAL_STATUSES,
  type ApplicationStatus, type ApplicationWithJob, type ContractType, type RemoteType,
  type EventType, type Cv,
} from '@joblog/shared';
import {
  ExternalLinkIcon, BuildingIcon, SendIcon, CalendarIcon, TrophyIcon,
  XCircleIcon, GhostIcon, BanIcon, PencilIcon, XIcon,
} from 'lucide-react';

interface Props {
  application: ApplicationWithJob | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function ApplicationDetail({ application, open, onClose, onUpdated }: Props) {
  const [cvs, setCvs] = useState<Omit<Cv, 'content'>[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetryingScrape, setIsRetryingScrape] = useState(false);
  const [cancelAllOpen, setCancelAllOpen] = useState(false);
  const [editJobOpen, setEditJobOpen] = useState(false);

  useEffect(() => {
    if (open) {
      api.cvs.list().then((r) => setCvs(r.data)).catch(() => {});
    }
  }, [open]);

  if (!application) return null;

  const jp = application.jobPosting;
  const logoUrl = getCompanyLogoUrl(jp, 80);
  const scrapeStatus = getJobScrapeStatus(jp);
  const scrapeReady = scrapeStatus === 'succeeded';
  const canEditJob = scrapeReady || scrapeStatus === 'failed';
  const showScrapeTimeline = !scrapeReady;

  async function patch(body: Record<string, unknown>) {
    setIsSaving(true);
    try {
      await api.applications.patch(application!._id, body);
      onUpdated();
      if (body.status === 'accepted') setCancelAllOpen(true);
    } finally {
      setIsSaving(false);
    }
  }

  async function addEvent(type: EventType, meta?: Record<string, unknown>) {
    await api.applications.addEvent(application!._id, { type, at: new Date().toISOString(), meta });
    onUpdated();
  }

  async function deleteEvent(type: EventType, at: string) {
    await api.applications.deleteEvent(application!._id, { type, at });
    onUpdated();
  }

  async function confirmFuture(type: EventType) {
    const status = (Object.entries(STATUS_EVENT) as [ApplicationStatus, EventType][])
      .find(([, e]) => e === type)?.[0];
    if (status) {
      await patch({ status });
    } else {
      await addEvent(type);
    }
  }

  async function updateEventDate(type: EventType, at: string, newAt: string) {
    await api.applications.updateEventDate(application!._id, { type, at, newAt });
    onUpdated();
  }

  async function retryScrape() {
    setIsRetryingScrape(true);
    try {
      await api.jobPostings.retryFromUrl(application!._id);
      toast.success('Relance lancée', {
        description: "La récupération de l'offre reprend en arrière-plan.",
      });
      onUpdated();
    } catch (err) {
      toast.error('Relance impossible', {
        description: err instanceof Error ? err.message : 'Erreur inconnue',
      });
    } finally {
      setIsRetryingScrape(false);
    }
  }

  return (
    <>
    <Dialog open={cancelAllOpen} onOpenChange={setCancelAllOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Félicitations !</DialogTitle>
          <DialogDescription>
            Vous avez accepté une offre. Voulez-vous annuler toutes vos autres candidatures actives ?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setCancelAllOpen(false)}>
            Non, garder
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              await api.applications.cancelAll(application._id);
              setCancelAllOpen(false);
              onUpdated();
            }}
          >
            Oui, tout annuler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <EditJobPostingDialog
      application={application}
      open={editJobOpen}
      onClose={() => setEditJobOpen(false)}
      onSaved={onUpdated}
    />
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent showCloseButton={false} className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-start gap-3">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={`Logo ${jp?.company ?? 'entreprise'}`}
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
            <div className="flex items-center gap-0.5 flex-shrink-0 -mt-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                disabled={!canEditJob}
                onClick={() => setEditJobOpen(true)}
                aria-label="Modifier l'offre"
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  aria-label="Fermer"
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </SheetClose>
            </div>
          </div>
        </SheetHeader>

        <div className="px-6 py-4 flex flex-col gap-6">
          {showScrapeTimeline && (
            <>
              <ScrapeProgressTimeline
                status={scrapeStatus}
                steps={jp?.scrape_steps}
                startedAt={jp?.scrape_started_at}
                createdAt={jp?.created_at}
                attempts={jp?.scrape_attempts}
                error={jp?.scrape_error}
                isRetrying={isRetryingScrape}
                onRetry={retryScrape}
              />
              {scrapeStatus === 'failed' && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditJobOpen(true)}>
                    <PencilIcon className="h-3.5 w-3.5 mr-1.5" />
                    Modifier manuellement
                  </Button>
                </div>
              )}
              <Separator />
            </>
          )}

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Statut</span>
              <StatusBadge status={application.status} />
            </div>
            <Select
              value={application.status}
              onValueChange={(v) => patch({ status: v })}
              disabled={!scrapeReady || isSaving}
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
            {scrapeReady && application.status === 'saved' && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" disabled={isSaving} onClick={() => patch({ status: 'applied' })}>
                  <SendIcon className="h-3.5 w-3.5 mr-1.5" />
                  Candidature envoyée
                </Button>
                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => patch({ status: 'rejected' })}>
                  <XCircleIcon className="h-3.5 w-3.5 mr-1.5" />
                  Refusée
                </Button>
                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => patch({ status: 'ghosted' })}>
                  <GhostIcon className="h-3.5 w-3.5 mr-1.5" />
                  Ghostée
                </Button>
                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => patch({ status: 'cancelled' })}>
                  <BanIcon className="h-3.5 w-3.5 mr-1.5" />
                  Annuler
                </Button>
              </div>
            )}
            {scrapeReady && application.status === 'applied' && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" disabled={isSaving} onClick={() => patch({ status: 'interview' })}>
                  <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                  Entretien reçu
                </Button>
                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => patch({ status: 'rejected' })}>
                  <XCircleIcon className="h-3.5 w-3.5 mr-1.5" />
                  Refusée
                </Button>
                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => patch({ status: 'ghosted' })}>
                  <GhostIcon className="h-3.5 w-3.5 mr-1.5" />
                  Ghostée
                </Button>
                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => patch({ status: 'cancelled' })}>
                  <BanIcon className="h-3.5 w-3.5 mr-1.5" />
                  Annuler
                </Button>
              </div>
            )}
            {scrapeReady && application.status === 'interview' && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => addEvent('interview_scheduled')}>
                  <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                  Nouvel entretien
                </Button>
                <Button size="sm" disabled={isSaving} onClick={() => patch({ status: 'offer' })}>
                  <TrophyIcon className="h-3.5 w-3.5 mr-1.5" />
                  Offre reçue
                </Button>
                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => patch({ status: 'rejected' })}>
                  <XCircleIcon className="h-3.5 w-3.5 mr-1.5" />
                  Refusée
                </Button>
                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => patch({ status: 'ghosted' })}>
                  <GhostIcon className="h-3.5 w-3.5 mr-1.5" />
                  Ghostée
                </Button>
                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => patch({ status: 'cancelled' })}>
                  <BanIcon className="h-3.5 w-3.5 mr-1.5" />
                  Annuler
                </Button>
              </div>
            )}
            {scrapeReady && application.status === 'offer' && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" disabled={isSaving} onClick={() => patch({ status: 'accepted' })}>
                  <TrophyIcon className="h-3.5 w-3.5 mr-1.5" />
                  Acceptée
                </Button>
                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => addEvent('offer_declined')}>
                  <XCircleIcon className="h-3.5 w-3.5 mr-1.5" />
                  Refusée
                </Button>
                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => patch({ status: 'ghosted' })}>
                  <GhostIcon className="h-3.5 w-3.5 mr-1.5" />
                  Ghostée
                </Button>
              </div>
            )}
          </section>

          <Separator />

          {scrapeReady && (
            <>
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
            </>
          )}

          <section className="flex flex-col gap-3">
            <span className="text-sm font-medium">Contact</span>
            <ContactFields
              contact={application.contact}
              onSave={(contact) => patch({ contact })}
            />
          </section>

          <Separator />

          {scrapeReady && (
            <>
              <EventTimeline
                events={application.events}
                currentStatus={application.status}
                onAddEvent={addEvent}
                onDeleteEvent={deleteEvent}
                onConfirmFuture={confirmFuture}
                onUpdateEventDate={updateEventDate}
              />

              <Separator />
            </>
          )}

          <section className="flex flex-col gap-3">
            <span className="text-sm font-medium">Notes</span>
            <NotesField
              value={application.notes ?? ''}
              onSave={(notes) => patch({ notes })}
            />
          </section>

          <Separator />

          {scrapeReady && (
            <>
              <section className="flex flex-col gap-3">
                <span className="text-sm font-medium">Relances</span>
                <ReminderFields
                  reminder={application.reminder}
                  status={application.status}
                  events={application.events}
                  appliedAt={application.appliedAt}
                  onSave={(r) => patch({ reminder: r })}
                />
              </section>

              <Separator />
            </>
          )}

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
    </>
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

function computeNextAt(baseIso: string | null, frequencyDays: number): string {
  const base = baseIso ? new Date(baseIso) : new Date();
  const next = new Date(base.getTime() + frequencyDays * 24 * 60 * 60 * 1000);
  return next.toISOString();
}

function ReminderFields({
  reminder,
  status,
  events,
  appliedAt,
  onSave,
}: {
  reminder: ApplicationWithJob['reminder'];
  status: ApplicationStatus;
  events: ApplicationWithJob['events'];
  appliedAt: ApplicationWithJob['appliedAt'];
  onSave: (r: Partial<ApplicationWithJob['reminder']>) => void;
}) {
  const [frequencyDays, setFrequencyDays] = useState(reminder.frequencyDays);
  const [at, setAt] = useState(reminder.at ?? null);

  const isTerminal = TERMINAL_STATUSES.includes(status);

  const followupEvents = events
    .filter((e) => e.type === 'followup_sent')
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const hasFollowup = followupEvents.length > 0;
  const lastFollowupAt = hasFollowup ? followupEvents[0].at : null;

  function handleFrequencyBlur(value: number) {
    const days = value || 7;
    setFrequencyDays(days);
    const base = lastFollowupAt ?? appliedAt ?? null;
    const nextAt = computeNextAt(base, days);
    setAt(nextAt);
    onSave({ frequencyDays: days, at: nextAt });
  }

  function handleLastFollowupChange(dateValue: string) {
    if (!dateValue) return;
    const newBase = new Date(dateValue + 'T12:00:00').toISOString();
    const nextAt = computeNextAt(newBase, frequencyDays);
    setAt(nextAt);
    onSave({ at: nextAt });
  }

  return (
    <div className={`flex flex-col gap-3 ${isTerminal ? 'opacity-50 pointer-events-none' : ''}`}>
      {isTerminal && (
        <p className="text-xs text-muted-foreground">Les relances sont désactivées pour ce statut.</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Fréquence (jours)</Label>
          <Input
            type="number"
            min={1}
            value={frequencyDays}
            onChange={(e) => setFrequencyDays(Number(e.target.value) || 7)}
            onBlur={(e) => handleFrequencyBlur(Number(e.target.value) || 7)}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Prochaine relance</Label>
          <Input
            type="date"
            value={at ? new Date(at).toISOString().slice(0, 10) : ''}
            onChange={(e) => {
              const iso = e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : null;
              setAt(iso);
              onSave({ at: iso });
            }}
            className="h-8 text-sm"
          />
        </div>
      </div>
      {hasFollowup && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Dernière relance envoyée</Label>
          <Input
            type="date"
            defaultValue={lastFollowupAt ? new Date(lastFollowupAt).toISOString().slice(0, 10) : ''}
            onChange={(e) => handleLastFollowupChange(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      )}
    </div>
  );
}
