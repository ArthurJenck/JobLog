import { type UrlPasteUsage } from '@/lib/api';

export function UrlUsageNotice({
  usage,
  extensionUrl,
}: {
  usage: UrlPasteUsage;
  extensionUrl: string | null;
}) {
  if (usage.isBlocked) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <p className="font-medium">Limite dashboard atteinte pour aujourd’hui.</p>
        <p className="mt-1 text-amber-900/80">
          L'extension reste disponible pour ajouter des offres sans consommer ce quota.
          {!extensionUrl && ' Le lien d’installation sera ajouté dès qu’elle sera publiée.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">
        {usage.count}/{usage.limit} ajouts par URL réussis aujourd’hui.
      </span>{' '}
      Installe l'extension pour ajouter les offres sans limite depuis les sites d’emploi.
    </div>
  );
}
