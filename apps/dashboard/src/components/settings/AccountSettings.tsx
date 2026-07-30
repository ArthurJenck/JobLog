import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { isSoundEnabled, setSoundEnabled } from '@/lib/sound';
import { useUser } from '@/hooks/use-user';
import { useConfirm } from '@/hooks/useConfirm';
import { ProfileForm } from './ProfileForm';

export function AccountSettings() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled);
  const { user, loading: userLoading } = useUser();
  const { confirm, confirmDialog } = useConfirm();

  function toggleSound(checked: boolean) {
    setSoundEnabledState(checked);
    setSoundEnabled(checked);
  }

  async function deleteAccount() {
    const ok = await confirm({
      title: 'Supprimer définitivement ton compte ?',
      description:
        'Toutes tes données (candidatures, CVs…) seront effacées. Cette action est irréversible.',
      confirmLabel: 'Continuer',
    });
    if (!ok) return;
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
      {confirmDialog}
      <div className="rounded-lg border p-4 flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium">Profil</p>
          <p className="text-xs text-muted-foreground mt-1">
            Utilisé pour personnaliser tes messages de félicitations.
          </p>
        </div>
        {userLoading ? (
          <p className="text-xs text-muted-foreground">Chargement…</p>
        ) : (
          <ProfileForm user={user ?? { firstName: '', sex: 'unspecified' }} />
        )}
      </div>
      <div className="rounded-lg border p-4 flex items-start gap-3">
        <Checkbox
          id="sound-enabled"
          checked={soundEnabled}
          onCheckedChange={(value) => toggleSound(value === true)}
          className="mt-0.5"
        />
        <div>
          <Label htmlFor="sound-enabled">Sons d'interface</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Petits effets sonores lors des interactions (cases à cocher, confettis…).
          </p>
        </div>
      </div>
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
