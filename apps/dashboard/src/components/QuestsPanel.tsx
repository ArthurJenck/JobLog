import { useQuests } from '@/lib/app-context';
import { getPendingQuests } from '@/lib/questHelpers';
import { QuestItem } from '@/components/QuestItem';

export function QuestsPanel() {
  const { quests } = useQuests();
  const pending = getPendingQuests(quests).sort((a, b) => a.order - b.order);

  if (pending.length === 0) return null;

  return (
    <div className="px-2 py-2 flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
        Tâches du jour
      </p>
      <div className="flex flex-col gap-1">
        {pending.map((quest) => (
          <QuestItem
            key={quest._id}
            quest={quest}
            willCompleteAll={pending.length === 1}
          />
        ))}
      </div>
    </div>
  );
}
