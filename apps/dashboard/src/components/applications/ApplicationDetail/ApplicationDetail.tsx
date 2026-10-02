import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { localDayKey } from '@joblog/shared';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/applications/StatusBadge';
import { SourceBadge } from '@/components/applications/SourceBadge';
import { EventTimeline } from '@/components/applications/EventTimeline';
import { ScrapeProgressTimeline } from '@/components/applications/ScrapeProgressTimeline';
import { AnalyzePanel } from '@/components/applications/AnalyzePanel';
import { EditJobPostingDialog } from '@/components/applications/EditJobPostingDialog';
import { StatusActions } from './StatusActions';
import { ContactFields } from './ContactFields';
import { NotesField } from './NotesField';
import { ReminderFields } from './ReminderFields';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useConfirm } from '@/hooks/useConfirm';
import { useOptimisticApplication } from '@/hooks/useOptimisticApplication';
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
  APPLICATION_STATUSES,
  STATUS_LABELS,
  CONTRACT_LABELS,
  REMOTE_LABELS,
  STATUS_EVENT,
  type ApplicationStatus,
  type ApplicationWithJob,
  type ContractType,
  type RemoteType,
  type EventType,
} from '@joblog/shared';
import {
  ExternalLinkIcon,
  BuildingIcon,
  PencilIcon,
  XIcon,
} from 'lucide-react';
import {
  eventControlKey,
  type ApplicationPatch,
  type JobPostingPatch,
} from '@/lib/optimistic-application';

interface Props {
  application: ApplicationWithJob | null;
  open: boolean;
  onClose: () => void;
}

function scrapeFailureHint(
  category: ApplicationWithJob['jobPosting']['scrape_error_category'],
) {
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

export function ApplicationDetail({ application, open, onClose }: Props) {
  const qc = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [cancelAllOpen, setCancelAllOpen] = useState(false);
  const [editJobOpen, setEditJobOpen] = useState(false);
  const { run, isPending } = useOptimisticApplication(application);

  const cvsQuery = useQuery({
    queryKey: qk.cvs.all,
    queryFn: () => api.cvs.list().then((r) => r.data),
    enabled: open,
  });
  const cvs = cvsQuery.data ?? [];

  const id = application?._id ?? '';

  const invalidateAll = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.applications.all }),
      qc.invalidateQueries({ queryKey: qk.stats }),
      qc.invalidateQueries({ queryKey: qk.tasks(localDayKey()) }),
    ]);

  const retryScrapeMutation = useMutation({
    mutationFn: () => {
      playLoading();
      return api.jobPostings.retryFromUrl(id);
    },
    onSuccess: async () => {
      playReady();
      toast.success('Relance lancée', {
        description: "La récupération de l'offre reprend en arrière-plan.",
      });
      await invalidateAll();
    },
    onError: (err) => {
      playError();
      toast.error('Relance impossible', {
        description: err instanceof Error ? err.message : 'Erreur inconnue',
      });
    },
  });

  const cancelAllMutation = useMutation({
    mutationFn: () => api.applications.cancelAll(id),
    onSuccess: () => invalidateAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.applications.delete(id),
    onSuccess: async () => {
      playDelete();
      await invalidateAll();
      onClose();
    },
  });

  const isRetryingScrape = retryScrapeMutation.isPending;

  function patchControlKey(body: ApplicationPatch) {
    if (body.status !== undefined) return 'status';
    if (body.cvId !== undefined) return 'cv';
    if (body.contact !== undefined) return 'contact';
    if (body.notes !== undefined) return 'notes';
    return 'application';
  }

  async function patch(body: ApplicationPatch) {
    try {
      await run(
        {
          type: 'patchApplication',
          patch: body,
          controlKey: patchControlKey(body),
        },
        { errorMessage: 'Impossible de mettre à jour la candidature' },
      );
      if (body.status === 'accepted') {
        setCancelAllOpen(true);
        playAccepted();
      } else if (
        body.status === 'rejected' ||
        body.status === 'ghosted' ||
        body.status === 'cancelled'
      ) {
        playReject();
      }
    } catch {
      return;
    }
  }

  async function addEvent(type: EventType, meta?: Record<string, unknown>) {
    const at = new Date().toISOString();
    try {
      await run(
        {
          type: 'addEvent',
          event: { type, at, meta: meta ?? null },
          controlKey: eventControlKey('add', type),
        },
        { errorMessage: "Impossible d'ajouter l'événement" },
      );
    } catch {
      return;
    }
  }

  async function deleteEvent(type: EventType, at: string) {
    try {
      await run(
        {
          type: 'deleteEvent',
          event: { type, at },
          controlKey: eventControlKey('delete', type, at),
        },
        { errorMessage: "Impossible de supprimer l'événement" },
      );
    } catch {
      return;
    }
  }

  async function confirmFuture(type: EventType) {
    const status = (
      Object.entries(STATUS_EVENT) as [ApplicationStatus, EventType][]
    ).find(([, e]) => e === type)?.[0];
    if (status) {
      await patch({ status });
    } else {
      await addEvent(type);
    }
  }

  async function updateEventDate(type: EventType, at: string, newAt: string) {
    try {
      await run(
        {
          type: 'updateEventDate',
          event: { type, at, newAt },
          controlKey: eventControlKey('date', type, at),
        },
        { errorMessage: "Impossible de modifier la date de l'événement" },
      );
    } catch {
      return;
    }
  }

  function patchReminder(
    reminder: Partial<ApplicationWithJob['reminder']>,
  ) {
    const controlKey =
      reminder.enabled === undefined ? 'reminder-fields' : 'reminder-toggle';
    void run(
      { type: 'patchReminder', patch: reminder, controlKey },
      { errorMessage: 'Impossible de modifier les relances' },
    ).catch(() => undefined);
  }

  function patchJobPosting(patch: JobPostingPatch) {
    return run(
      { type: 'patchJobPosting', patch, controlKey: 'jobPosting' },
      { errorMessage: "Impossible de modifier l'offre" },
    );
  }

  function retryScrape() {
    retryScrapeMutation.mutate();
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Supprimer cette candidature ?',
      confirmLabel: 'Supprimer',
    });
    if (ok) deleteMutation.mutate();
  }

  if (!application) return null;

  const jp = application.jobPosting;
  const logoUrl = getCompanyLogoUrl(jp, 80);
  const scrapeStatus = getJobScrapeStatus(jp);
  const scrapeReady = scrapeStatus === 'succeeded';
  const canEditJob = scrapeReady || scrapeStatus === 'failed';
  const defaultCv =
    cvs.find((cv) => cv.isDefault) ?? (cvs.length === 1 ? cvs[0] : undefined);
  const effectiveCvId = application.cvId ?? defaultCv?._id ?? null;

  return (
    <>
      {confirmDialog}
      <Dialog open={cancelAllOpen} onOpenChange={setCancelAllOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Félicitations !</DialogTitle>
            <DialogDescription>
              Vous avez accepté une offre. Voulez-vous annuler toutes vos autres
              candidatures actives ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelAllOpen(false)}
            >
              Non, garder
            </Button>
            <Button
              size="sm"
              onClick={() => {
                cancelAllMutation.mutate();
                setCancelAllOpen(false);
              }}
            >
              Oui, tout annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {editJobOpen && (
        <EditJobPostingDialog
          application={application}
          open
          onClose={() => setEditJobOpen(false)}
          onSave={patchJobPosting}
        />
      )}
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          showCloseButton={false}
          className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-0 p-0"
        >
          <SheetHeader className="px-6 py-4 border-b">
            <div className="flex items-start gap-3">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={`Logo ${jp?.company ?? 'entreprise'}`}
                  className="h-10 w-10 rounded-lg object-contain shrink-0 mt-0.5"
                  referrerPolicy="origin"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display =
                      'none';
                  }}
                />
              )}
              {!logoUrl && (
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <BuildingIcon className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-base leading-tight">
                  {jp?.title ?? '—'}
                </SheetTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {jp?.company ?? '—'}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {jp?.source && (
                    <SourceBadge
                      source={jp.source}
                      label={jp.source_label}
                    />
                  )}
                  {jp?.contract_type && (
                    <span className="text-xs text-muted-foreground">
                      {CONTRACT_LABELS[jp.contract_type as ContractType] ??
                        jp.contract_type.toUpperCase()}
                    </span>
                  )}
                  {jp?.remote && (
                    <span className="text-xs text-muted-foreground">
                      {REMOTE_LABELS[jp.remote as RemoteType] ?? jp.remote}
                    </span>
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
              <div className="flex items-center gap-0.5 shrink-0 -mt-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  disabled={!canEditJob || isPending('jobPosting')}
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditJobOpen(true)}
                    >
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
                onValueChange={(v) =>
                  void patch({ status: v as ApplicationStatus })
                }
                disabled={!scrapeReady || isPending('status')}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPLICATION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {scrapeReady && (
                <StatusActions
                  status={application.status}
                  isPending={isPending}
                  onPatch={(body) => void patch(body)}
                  onAddEvent={(type) => void addEvent(type)}
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
                    onValueChange={(v) =>
                      patch({ cvId: v === '__none__' ? null : v })
                    }
                    disabled={isPending('cv')}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Aucun CV associé" />
                    </SelectTrigger>
                    <SelectContent>
                      {cvs.map((cv) => (
                        <SelectItem key={cv._id} value={cv._id}>
                          {cv.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!scrapeReady && (
                    <p className="text-xs text-muted-foreground">
                      {scrapeFailureHint(jp?.scrape_error_category)}
                    </p>
                  )}
                  {effectiveCvId && (
                    <AnalyzePanel
                      applicationId={application._id}
                      cvId={effectiveCvId}
                    />
                  )}
                </section>

                <Separator />
              </>
            )}

            <section className="flex flex-col gap-3">
              <span className="text-sm font-medium">Contact</span>
              <ContactFields
                key={`${application._id}:${application.contact?.name ?? ''}:${application.contact?.role ?? ''}:${application.contact?.email ?? ''}:${application.contact?.phone ?? ''}`}
                contact={application.contact}
                disabled={isPending('contact')}
                onSave={(contact) => void patch({ contact })}
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
                  isPending={isPending}
                />

                <Separator />
              </>
            )}

            <section className="flex flex-col gap-3">
              <span className="text-sm font-medium">Notes</span>
              <NotesField
                key={`${application._id}:${application.notes ?? ''}`}
                value={application.notes ?? ''}
                disabled={isPending('notes')}
                onSave={(notes) => void patch({ notes })}
              />
            </section>

            <Separator />

            {scrapeReady && (
              <>
                <section className="flex flex-col gap-3">
                  <span className="text-sm font-medium">Relances</span>
                  <ReminderFields
                    key={`${application._id}:${application.reminder.enabled}:${application.reminder.frequencyDays}:${application.reminder.at ?? ''}:${application.reminder.snoozedUntil ?? ''}:${application.events.map((event) => `${event.type}:${event.at}`).join('|')}`}
                    reminder={application.reminder}
                    status={application.status}
                    events={application.events}
                    appliedAt={application.appliedAt}
                    togglePending={isPending('reminder-toggle')}
                    fieldsPending={isPending('reminder-fields')}
                    onSave={patchReminder}
                  />
                </section>

                <Separator />
              </>
            )}

            <div className="flex justify-end pb-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
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
