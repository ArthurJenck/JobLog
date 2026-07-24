import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  REMINDER_ELIGIBLE_STATUSES,
  type ApplicationStatus,
  type ApplicationWithJob,
} from '@joblog/shared';

function computeNextAt(baseIso: string | null, frequencyDays: number): string {
  const base = baseIso ? new Date(baseIso) : new Date();
  const next = new Date(base.getTime() + frequencyDays * 24 * 60 * 60 * 1000);
  return next.toISOString();
}

export function ReminderFields({
  reminder,
  status,
  events,
  appliedAt,
  onSave,
}: {
  reminder: ApplicationWithJob['reminder'];
  status: ApplicationStatus;
  events: ApplicationWithJob['events'];
  appliedAt: ApplicationWithJob['appliedAt'];
  onSave: (r: Partial<ApplicationWithJob['reminder']>) => void;
}) {
  const [frequencyDays, setFrequencyDays] = useState(reminder.frequencyDays);
  const [at, setAt] = useState(reminder.at ?? null);

  const isTerminal = !REMINDER_ELIGIBLE_STATUSES.includes(status);

  const followupEvents = events
    .filter((e) => e.type === 'followup_sent')
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const hasFollowup = followupEvents.length > 0;
  const lastFollowupAt = hasFollowup ? followupEvents[0].at : null;

  function handleFrequencyBlur(value: number) {
    const days = value || 7;
    setFrequencyDays(days);
    const base = lastFollowupAt ?? appliedAt ?? null;
    const nextAt = computeNextAt(base, days);
    setAt(nextAt);
    onSave({ frequencyDays: days, at: nextAt });
  }

  function handleLastFollowupChange(dateValue: string) {
    if (!dateValue) return;
    const newBase = new Date(dateValue + 'T12:00:00').toISOString();
    const nextAt = computeNextAt(newBase, frequencyDays);
    setAt(nextAt);
    onSave({ at: nextAt });
  }

  return (
    <div
      className={`flex flex-col gap-3 ${isTerminal ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {isTerminal && (
        <p className="text-xs text-muted-foreground">
          Les relances sont désactivées pour ce statut.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Fréquence (jours)</Label>
          <Input
            type="number"
            min={1}
            value={frequencyDays}
            onChange={(e) => setFrequencyDays(Number(e.target.value) || 7)}
            onBlur={(e) => handleFrequencyBlur(Number(e.target.value) || 7)}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Prochaine relance</Label>
          <Input
            type="date"
            value={at ? new Date(at).toISOString().slice(0, 10) : ''}
            onChange={(e) => {
              const iso = e.target.value
                ? new Date(e.target.value + 'T12:00:00').toISOString()
                : null;
              setAt(iso);
              onSave({ at: iso });
            }}
            className="h-8 text-sm"
          />
        </div>
      </div>
      {hasFollowup && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Dernière relance envoyée</Label>
          <Input
            type="date"
            defaultValue={
              lastFollowupAt
                ? new Date(lastFollowupAt).toISOString().slice(0, 10)
                : ''
            }
            onChange={(e) => handleLastFollowupChange(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      )}
    </div>
  );
}
