import { Button } from '@/components/ui/button';

export function JobListUrlNotice({
  message,
  extensionUrl,
  onSwitchToManual,
}: {
  message: string;
  extensionUrl: string | null;
  onSwitchToManual: () => void;
}) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <p className="font-medium">Ce lien ne mène pas à une offre précise</p>
      <p className="mt-1 text-amber-900/80">{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onSwitchToManual}>
          Passer en saisie manuelle
        </Button>
        {extensionUrl && (
          <Button type="button" size="sm" variant="ghost" asChild>
            <a href={extensionUrl} target="_blank" rel="noreferrer">
              Installer l'extension
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
