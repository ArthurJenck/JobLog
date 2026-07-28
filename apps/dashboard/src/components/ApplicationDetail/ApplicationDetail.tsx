import { useState, useEffect } from 'react';
import {
  Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/StatusBadge';
import { SourceBadge } from '@/components/SourceBadge';
import { EventTimeline } from '@/components/EventTimeline';
import { ScrapeProgressTimeline } from '@/components/ScrapeProgressTimeline';
import { AnalyzePanel } from '@/components/AnalyzePanel';
import { EditJobPostingDialog } from '@/components/EditJobPostingDialog';
import { StatusActions } from './StatusActions';
import { ContactFields } from './ContactFields';
import { NotesField } from './NotesField';
import { ReminderFields } from './ReminderFields';
import { api } from '@/lib/api';
import { getCompanyLogoUrl } from '@/lib/company-logo';
import { getJobScrapeStatus } from '@/lib/scrape';
import { toast } from 'sonner';
import {
  playAccepted,
  playReject,
  playDelete,
  playError,
  playLoading,
  playReady,
} from '@/lib/sound';
import {
  APPLICATION_STATUSES, STATUS_LABELS, CONTRACT_LABELS, REMOTE_LABELS,
  STATUS_EVENT,
  type ApplicationStatus, type ApplicationWithJob, type ContractType, type RemoteType,
  type EventType, type Cv,
} from '@joblog/shared';
import {
  ExternalLinkIcon, BuildingIcon, PencilIcon, XIcon,
} from 'lucide-react';

interface Props {
  application: ApplicationWithJob | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

function scrapeFailureHint(category: ApplicationWithJob['jobPosting']['scrape_error_category']) {
  switch (category) {
    case 'site_blocked':
      return "L'offre n'a pas pu être récupérée automatiquement (site bloqué). Colle le texte de l'offre ci-dessous pour analyser quand même.";
    case 'service_unavailable':
      return 'Récupération momentanément indisponible. Réessaie plus tard ou colle le texte de l’offre pour analyser quand même.';
    case 'extraction_failed':
    case 'no_content':
      return "Le contenu de l'offre n'a pas pu être extrait. Colle le texte de l'offre ci-dessous pour analyser quand même.";
    default:
      return "La récupération de l'offre a échoué. Colle le texte de l'offre ci-dessous pour analyser quand même.";
  }
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
  const defaultCv = cvs.find((cv) => cv.isDefault) ?? (cvs.length === 1 ? cvs[0] : undefined);
  const effectiveCvId = application.cvId ?? defaultCv?._id ?? null;

  async function patch(body: Record<string, unknown>) {
    setIsSaving(true);
    try {
      await api.applications.patch(application!._id, body);
      onUpdated();
      if (body.status === 'accepted') {
        setCancelAllOpen(true);
        playAccepted();
      } else if (body.status === 'rejected' || body.status === 'ghosted' || body.status === 'cancelled') {
        playReject();
      }
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
    playLoading();
    try {
      await api.jobPostings.retryFromUrl(application!._id);
      playReady();
      toast.success('Relance lancée', {
        description: "La récupération de l'offre reprend en arrière-plan.",
      });
      onUpdated();
    } catch (err) {
      playError();
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
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(jp.location)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    {jp.location}
                  </a>
                )}
                {jp?.url && (
                  <a
                    href={jp.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <ExternalLinkIcon className="h-3 w-3" />
                    Voir l'offre
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
          {!scrapeReady && (
            <>
              <ScrapeProgressTimeline
                status={scrapeStatus}
                steps={jp?.scrape_steps}
                startedAt={jp?.scrape_started_at}
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
            {scrapeReady && (
              <StatusActions
                status={application.status}
                isSaving={isSaving}
                onPatch={patch}
                onAddEvent={addEvent}
              />
            )}
          </section>

          <Separator />

          {(scrapeReady || scrapeStatus === 'failed') && (
            <>
              <section className="flex flex-col gap-3">
                <span className="text-sm font-medium">CV associé</span>
                <Select
                  value={effectiveCvId ?? '__none__'}
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
                {!scrapeReady && (
                  <p className="text-xs text-muted-foreground">
                    {scrapeFailureHint(jp?.scrape_error_category)}
                  </p>
                )}
                {effectiveCvId && (
                  <AnalyzePanel applicationId={application._id} cvId={effectiveCvId} />
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
                  playDelete();
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
