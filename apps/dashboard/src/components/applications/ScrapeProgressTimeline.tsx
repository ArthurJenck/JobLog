import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ScrapeStatus, ScrapeStep } from '@joblog/shared';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
} from 'lucide-react';

interface Props {
  status: ScrapeStatus;
  steps?: ScrapeStep[];
  startedAt?: string | null;
  createdAt?: string | null;
  attempts?: number | null;
  error?: string | null;
  isRetrying?: boolean;
  onRetry?: () => void;
}

const FALLBACK_STEPS: ScrapeStep[] = [
  { key: 'created', label: 'Candidature créée', status: 'succeeded', at: null, message: null },
  { key: 'fetch', label: 'Lecture de la page', status: 'pending', at: null, message: null },
  { key: 'extract', label: 'Extraction des informations', status: 'pending', at: null, message: null },
  { key: 'normalize', label: 'Normalisation', status: 'pending', at: null, message: null },
  { key: 'complete', label: 'Offre prête', status: 'pending', at: null, message: null },
];

const RETRY_AFTER_SECONDS = 45;
const HIDDEN_STEP_KEYS = new Set<ScrapeStep['key']>(['normalize', 'complete']);

export function ScrapeProgressTimeline({
  status,
  steps,
  startedAt,
  createdAt,
  attempts,
  error,
  isRetrying,
  onRetry,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const timelineSteps = steps?.length ? steps : FALLBACK_STEPS;
  const visibleSteps = useMemo(
    () => timelineSteps.filter((step) => !HIDDEN_STEP_KEYS.has(step.key)),
    [timelineSteps],
  );
  const isFailed = status === 'failed';
  const isActive = status === 'queued' || status === 'processing';
  const totalStartedAt = useMemo(
    () => getStartMs(timelineSteps, startedAt, createdAt, attempts),
    [timelineSteps, startedAt, createdAt, attempts],
  );
  const elapsedSeconds = totalStartedAt
    ? Math.max(0, Math.floor((now - totalStartedAt) / 1000))
    : null;
  const canRetry =
    isFailed ||
    (isActive && elapsedSeconds !== null && elapsedSeconds >= RETRY_AFTER_SECONDS);
  const hasProcessingStep = timelineSteps.some((step) => step.status === 'processing');
  const activePendingKey =
    !hasProcessingStep && (status === 'queued' || status === 'processing')
      ? visibleSteps.find((step) => step.status === 'pending')?.key
      : null;
  const title = isFailed
    ? 'Récupération interrompue'
    : status === 'succeeded'
      ? 'Offre récupérée'
      : 'Récupération de l’offre';

  useEffect(() => {
    if (!isActive) return;

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isActive]);

  return (
    <section className="rounded-md border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{title}</p>
            {elapsedSeconds !== null && status !== 'succeeded' && (
              <span className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {formatDuration(elapsedSeconds)}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isFailed
              ? error ?? "Impossible de récupérer cette offre automatiquement."
              : status === 'succeeded'
                ? 'Toutes les étapes de récupération sont terminées.'
                : "La candidature est déjà ajoutée, l'offre sera complétée automatiquement."}
          </p>
        </div>
        {canRetry && onRetry && (
          <Button size="sm" variant="outline" disabled={isRetrying} onClick={onRetry}>
            <RefreshCwIcon className={isRetrying ? 'animate-spin' : ''} />
            Relancer
          </Button>
        )}
      </div>

      <ol className="mt-4 grid">
        {visibleSteps.map((step, index) => {
          const effectiveStatus =
            step.key === activePendingKey ? 'processing' : step.status;
          const isLastStep = index === visibleSteps.length - 1;
          const elapsedLabel = getStepElapsedLabel({
            step,
            steps: visibleSteps,
            index,
            effectiveStatus,
            startedAt: totalStartedAt,
            now,
          });

          return (
            <li key={step.key} className="relative flex items-start gap-3 pb-3 text-sm last:pb-0">
              {!isLastStep && (
                <span
                  aria-hidden="true"
                  className="absolute left-2 top-5 bottom-0 w-px bg-muted-foreground/30"
                />
              )}
              <div className="relative z-10 flex w-4 shrink-0 justify-center bg-muted/30">
                <StepIcon status={effectiveStatus} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className={effectiveStatus === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>
                    {step.label}
                  </span>
                  {elapsedLabel && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {elapsedLabel}
                    </span>
                  )}
                </div>
                {step.message && (
                  <p className="mt-0.5 text-xs text-destructive">{step.message}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StepIcon({ status }: { status: ScrapeStep['status'] }) {
  if (status === 'succeeded') {
    return <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />;
  }

  if (status === 'processing') {
    return <LoaderCircleIcon className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-600" />;
  }

  if (status === 'failed') {
    return <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
  }

  return <CircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />;
}

function getStartMs(
  steps: ScrapeStep[],
  preferredStart?: string | null,
  createdAt?: string | null,
  attempts?: number | null,
) {
  const canUseCreatedAt = attempts === undefined || attempts === null || attempts <= 1;
  const timestamps = [
    canUseCreatedAt ? parseTimestamp(createdAt) : null,
    parseTimestamp(preferredStart),
    ...steps.map((step) => parseTimestamp(step.at)),
  ].filter((timestamp): timestamp is number => timestamp !== null);

  return timestamps.length > 0 ? Math.min(...timestamps) : null;
}

function getStepElapsedLabel({
  step,
  steps,
  index,
  effectiveStatus,
  startedAt,
  now,
}: {
  step: ScrapeStep;
  steps: ScrapeStep[];
  index: number;
  effectiveStatus: ScrapeStep['status'];
  startedAt: number | null;
  now: number;
}) {
  if (!startedAt || effectiveStatus === 'pending') return null;
  if (index === 0) return null;

  const stepStartedAt =
    effectiveStatus === 'processing'
      ? parseTimestamp(step.at) ?? getPreviousStepTimestamp(steps, index) ?? startedAt
      : getPreviousStepTimestamp(steps, index) ?? startedAt;
  const stepFinishedAt =
    effectiveStatus === 'processing'
      ? now
      : parseTimestamp(step.at);

  if (!stepFinishedAt || !Number.isFinite(stepFinishedAt)) return null;

  const elapsedSeconds = Math.max(0, Math.floor((stepFinishedAt - stepStartedAt) / 1000));
  return formatDuration(elapsedSeconds);
}

function getPreviousStepTimestamp(steps: ScrapeStep[], index: number) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const timestamp = parseTimestamp(steps[i].at);
    if (timestamp) return timestamp;
  }

  return null;
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m${String(rest).padStart(2, '0')}`;
}
