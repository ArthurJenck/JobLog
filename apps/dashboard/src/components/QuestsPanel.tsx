import { useEffect, useRef, useState } from 'react';
import { useQuests } from '@/lib/app-context';
import { getPendingQuests } from '@/lib/questHelpers';
import { QuestItem } from '@/components/QuestItem';

const LINGER_MS = 650;

export function QuestsPanel() {
  const { quests } = useQuests();
  const pending = getPendingQuests(quests).sort((a, b) => a.order - b.order);
  const pendingIds = new Set(pending.map((q) => q._id));
  const pendingKey = pending.map((q) => q._id).join(',');

  const [lingeringIds, setLingeringIds] = useState<string[]>([]);
  const [prevPendingKey, setPrevPendingKey] = useState(pendingKey);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Detect the pending -> done transition while rendering (not in an effect) so the
  // row is never unmounted between the two states: it stays mounted and the
  // strikethrough clip-path can actually animate left -> right.
  if (prevPendingKey !== pendingKey) {
    const prevIds = new Set(prevPendingKey ? prevPendingKey.split(',') : []);
    setPrevPendingKey(pendingKey);
    setLingeringIds((prev) => {
      const next = new Set(prev);
      for (const id of prevIds) if (!pendingIds.has(id)) next.add(id);
      for (const id of pendingIds) next.delete(id);
      return [...next];
    });
  }

  // Give each lingering row its own removal timer; cancel it if it becomes pending again.
  useEffect(() => {
    for (const id of lingeringIds) {
      if (!timers.current.has(id)) {
        const timer = setTimeout(() => {
          timers.current.delete(id);
          setLingeringIds((prev) => prev.filter((x) => x !== id));
        }, LINGER_MS);
        timers.current.set(id, timer);
      }
    }
    for (const [id, timer] of timers.current) {
      if (!lingeringIds.includes(id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    }
  }, [lingeringIds]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
    };
  }, []);

  const keep = new Set([...pendingIds, ...lingeringIds]);
  const rows = quests
    .filter((q) => q.enabled && !q.removed && keep.has(q._id))
    .sort((a, b) => a.order - b.order);

  if (rows.length === 0) return null;

  return (
    <div className="px-2 py-2 flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
        Tâches du jour
      </p>
      <div className="flex flex-col gap-1">
        {rows.map((quest) => (
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
