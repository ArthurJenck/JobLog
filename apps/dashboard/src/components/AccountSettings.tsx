import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function AccountSettings() {
  const [isDeleting, setIsDeleting] = useState(false);

  async function deleteAccount() {
    if (!confirm('Supprimer définitivement ton compte et toutes tes données ? Cette action est irréversible.')) return;
    const confirm2 = window.prompt('Tape "SUPPRIMER" pour confirmer.');
    if (confirm2 !== 'SUPPRIMER') return;

    setIsDeleting(true);
    try {
      await fetch('/api/user', { method: 'DELETE', credentials: 'include' });
      window.location.href = '/login';
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-md">
      <div className="rounded-lg border border-destructive/30 p-4 flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-destructive">Zone de danger</p>
          <p className="text-xs text-muted-foreground mt-1">
            La suppression de ton compte efface toutes tes candidatures, CVs, et données associées. Irréversible.
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="w-fit"
          onClick={deleteAccount}
          disabled={isDeleting}
        >
          {isDeleting ? 'Suppression…' : 'Supprimer mon compte'}
        </Button>
      </div>
    </div>
  );
}
