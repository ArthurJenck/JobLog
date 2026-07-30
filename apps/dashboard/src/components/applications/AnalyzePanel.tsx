import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { SparklesIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

interface Props {
  applicationId: string;
  cvId: string | null;
}

type JobDescriptionInput = 'required' | 'optional' | null;

function mapAnalysisError(e: unknown): { error: string; jobDescriptionInput: JobDescriptionInput } {
  const apiError = e as { code?: string; status?: number; message?: string };
  if (apiError.code === 'no_comparison_data') {
    return { jobDescriptionInput: 'required', error: apiError.message ?? 'Aucune donnée à comparer avec votre CV.' };
  }
  if (apiError.status === 503) {
    return { jobDescriptionInput: null, error: apiError.message ?? "Service d'analyse temporairement indisponible, réessayez plus tard." };
  }
  if (apiError.code === 'analysis_failed') {
    return {
      jobDescriptionInput: 'optional',
      error: "L'analyse n'a pas pu être produite. Réessaie, ou colle le texte de l'offre ci-dessous pour analyser à partir de ce texte.",
    };
  }
  return { jobDescriptionInput: null, error: e instanceof Error ? e.message : 'Erreur inconnue' };
}

export function AnalyzePanel({ applicationId, cvId }: Props) {
  return (
    <AnalyzePanelInner
      key={`${applicationId}:${cvId ?? ''}`}
      applicationId={applicationId}
      cvId={cvId}
    />
  );
}

function AnalyzePanelInner({ applicationId, cvId }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [jobDescriptionInput, setJobDescriptionInput] = useState<JobDescriptionInput>(null);
  const [jobDescription, setJobDescription] = useState('');

  const analysisKey = qk.analyses(cvId ?? 'none', applicationId);

  const cacheQuery = useQuery({
    queryKey: analysisKey,
    queryFn: async () => {
      const { analysis } = await api.analyses.getCached({
        cvId: cvId!,
        applicationId,
      });
      return analysis;
    },
    enabled: Boolean(cvId),
    retry: false,
  });

  useEffect(() => {
    if (!cacheQuery.error) return;
    const apiError = cacheQuery.error as { code?: string; message?: string };
    if (apiError.code === 'no_comparison_data') {
      setJobDescriptionInput('required');
      setError(apiError.message ?? 'Aucune donnée à comparer avec votre CV.');
    } else {
      setError(
        cacheQuery.error instanceof Error
          ? cacheQuery.error.message
          : 'Erreur inconnue',
      );
    }
  }, [cacheQuery.error]);

  const analyzeMutation = useMutation({
    mutationFn: (options?: { force?: boolean }) =>
      api.analyses.create({
        cvId: cvId!,
        applicationId,
        force: options?.force,
        jobDescription: jobDescription.trim() || undefined,
      }),
    onSuccess: (data) => {
      setError('');
      qc.setQueryData(analysisKey, data);
    },
    onError: (e) => {
      const mapped = mapAnalysisError(e);
      if (mapped.jobDescriptionInput) {
        setJobDescriptionInput((current) => (current === 'required' ? 'required' : mapped.jobDescriptionInput));
      }
      setError(mapped.error);
    },
  });

  const result = cacheQuery.data ?? null;
  const isCheckingCache = cacheQuery.isLoading;
  const isLoading = analyzeMutation.isPending;

  function analyze(options?: { force?: boolean }) {
    if (!cvId) return;
    const pastedJobDescription = jobDescription.trim();
    if (jobDescriptionInput === 'required' && pastedJobDescription.length < 40) {
      setError('Collez le texte de l’offre pour lancer l’analyse.');
      return;
    }
    setError('');
    analyzeMutation.mutate(options);
  }

  if (isLoading || isCheckingCache) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const usesManualText =
    jobDescriptionInput === 'required' ||
    (jobDescriptionInput === 'optional' && jobDescription.trim().length >= 40);

  if (!result) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { void analyze(); }}
          disabled={!cvId || (jobDescriptionInput === 'required' && jobDescription.trim().length < 40)}
          title={!cvId ? 'Sélectionne un CV pour analyser' : undefined}
          className="w-fit"
        >
          <SparklesIcon className="h-3.5 w-3.5 mr-1.5" />
          {usesManualText ? 'Analyser avec ce texte' : 'Analyser CV vs offre'}
        </Button>
        {!cvId && (
          <p className="text-xs text-muted-foreground">Sélectionne d'abord un CV.</p>
        )}
        {jobDescriptionInput !== null && (
          <div className="flex flex-col gap-1.5 max-w-xl">
            <Textarea
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              placeholder="Colle ici le descriptif complet de l’offre…"
              className="min-h-32 resize-y text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Le texte est envoyé comme texte brut à Gemini pour cette analyse.
            </p>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {result.keywords_matched.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium flex items-center gap-1.5 text-green-700 dark:text-green-400">
            <CheckCircleIcon className="h-4 w-4" />
            Compétences présentes
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.keywords_matched.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.keywords_missing.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium flex items-center gap-1.5 text-red-700 dark:text-red-400">
            <XCircleIcon className="h-4 w-4" />
            À ajouter ou expliciter
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.keywords_missing.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.insights && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Conseils</p>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{result.insights}</p>
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => { void analyze({ force: true }); }}
        className="w-fit text-xs text-muted-foreground"
      >
        Relancer l'analyse
      </Button>
    </div>
  );
}
