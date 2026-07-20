import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Trash2Icon, XIcon } from 'lucide-react';
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from '@joblog/shared';

interface Props {
  count: number;
  onStatusChange: (status: ApplicationStatus) => void;
  onDelete: () => void;
  onClear: () => void;
}

export function ApplicationsTableBulkBar({ count, onStatusChange, onDelete, onClear }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={onClear}
        aria-label="Annuler la sélection"
      >
        <XIcon className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium">
        {count} sélectionnée{count > 1 ? 's' : ''}
      </span>
      <Select value="" onValueChange={(v) => onStatusChange(v as ApplicationStatus)}>
        <SelectTrigger className="h-8 w-48 text-sm">
          <SelectValue placeholder="Changer le statut" />
        </SelectTrigger>
        <SelectContent>
          {APPLICATION_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-destructive hover:text-destructive"
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2Icon className="h-3.5 w-3.5" />
        Supprimer
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer {count} candidature{count > 1 ? 's' : ''} ?</DialogTitle>
            <DialogDescription>
              Cette action est définitive et ne peut pas être annulée.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirmOpen(false);
                onDelete();
              }}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
