import { Button } from '@/components/ui/button';
import {
  SendIcon,
  CalendarIcon,
  TrophyIcon,
  XCircleIcon,
  GhostIcon,
  BanIcon,
} from 'lucide-react';
import type { ApplicationStatus, EventType } from '@joblog/shared';
import { eventControlKey } from '@/lib/optimistic-application';
import type { ApplicationPatch } from '@/lib/optimistic-application';

interface Props {
  status: ApplicationStatus;
  isPending: (controlKey: string) => boolean;
  onPatch: (body: ApplicationPatch) => void;
  onAddEvent: (type: EventType) => void;
}

export function StatusActions({
  status,
  isPending,
  onPatch,
  onAddEvent,
}: Props) {
  return (
    <>
      {status === 'saved' && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            disabled={isPending('status')}
            onClick={() => onPatch({ status: 'applied' })}
          >
            <SendIcon className="h-3.5 w-3.5 mr-1.5" />
            Candidature envoyée
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending('status')}
            onClick={() => onPatch({ status: 'rejected' })}
          >
            <XCircleIcon className="h-3.5 w-3.5 mr-1.5" />
            Refusée
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending('status')}
            onClick={() => onPatch({ status: 'ghosted' })}
          >
            <GhostIcon className="h-3.5 w-3.5 mr-1.5" />
            Ghostée
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending('status')}
            onClick={() => onPatch({ status: 'cancelled' })}
          >
            <BanIcon className="h-3.5 w-3.5 mr-1.5" />
            Annuler
          </Button>
        </div>
      )}
      {status === 'applied' && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            disabled={isPending('status')}
            onClick={() => onPatch({ status: 'interview' })}
          >
            <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
            Entretien reçu
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending('status')}
            onClick={() => onPatch({ status: 'rejected' })}
          >
            <XCircleIcon className="h-3.5 w-3.5 mr-1.5" />
            Refusée
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending('status')}
            onClick={() => onPatch({ status: 'ghosted' })}
          >
            <GhostIcon className="h-3.5 w-3.5 mr-1.5" />
            Ghostée
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending('status')}
            onClick={() => onPatch({ status: 'cancelled' })}
          >
            <BanIcon className="h-3.5 w-3.5 mr-1.5" />
            Annuler
          </Button>
        </div>
      )}
      {status === 'interview' && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending(eventControlKey('add', 'interview_scheduled'))}
            onClick={() => onAddEvent('interview_scheduled')}
          >
            <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
            Nouvel entretien
          </Button>
          <Button
            size="sm"
            disabled={isPending('status')}
            onClick={() => onPatch({ status: 'offer' })}
          >
            <TrophyIcon className="h-3.5 w-3.5 mr-1.5" />
            Offre reçue
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending('status')}
            onClick={() => onPatch({ status: 'rejected' })}
          >
            <XCircleIcon className="h-3.5 w-3.5 mr-1.5" />
            Refusée
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending('status')}
            onClick={() => onPatch({ status: 'ghosted' })}
          >
            <GhostIcon className="h-3.5 w-3.5 mr-1.5" />
            Ghostée
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending('status')}
            onClick={() => onPatch({ status: 'cancelled' })}
          >
            <BanIcon className="h-3.5 w-3.5 mr-1.5" />
            Annuler
          </Button>
        </div>
      )}
      {status === 'offer' && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            disabled={isPending('status')}
            onClick={() => onPatch({ status: 'accepted' })}
          >
            <TrophyIcon className="h-3.5 w-3.5 mr-1.5" />
            Acceptée
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending(eventControlKey('add', 'offer_declined'))}
            onClick={() => onAddEvent('offer_declined')}
          >
            <XCircleIcon className="h-3.5 w-3.5 mr-1.5" />
            Refusée
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending('status')}
            onClick={() => onPatch({ status: 'ghosted' })}
          >
            <GhostIcon className="h-3.5 w-3.5 mr-1.5" />
            Ghostée
          </Button>
        </div>
      )}
    </>
  );
}
