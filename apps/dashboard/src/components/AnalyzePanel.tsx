import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SparklesIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react';
import { api } from '@/lib/api';

interface Props {
  applicationId: string;
  cvId: string | null;
}

interface AnalysisResult {
  keywords_matched: string[];
  keywords_missing: string[];
  insights: string;
  cached?: boolean;
}

export function AnalyzePanel({ applicationId, cvId }: Props) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function analyze(options?: { force?: boolean }) {
    if (!cvId) return;
    setIsLoading(true);
    setError('');
    if (options?.force) setResult(null);
    try {
      const data = await api.analyses.create({ cvId, applicationId, force: options?.force });
      setResult(data);
    } catch (e) {
      if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 503) {
        setError("Service d'analyse temporairement indisponible, réessayez demain.");
      } else {
        setError(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { void analyze(); }}
          disabled={!cvId}
          title={!cvId ? 'Sélectionne un CV pour analyser' : undefined}
          className="w-fit"
        >
          <SparklesIcon className="h-3.5 w-3.5 mr-1.5" />
          Analyser CV vs offre
        </Button>
        {!cvId && (
          <p className="text-xs text-muted-foreground">Sélectionne d'abord un CV.</p>
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
