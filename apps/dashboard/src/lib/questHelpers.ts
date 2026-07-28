import { isSameLocalDay } from './platformReminder';
import type { Quest } from './api';

export function isQuestDoneToday(quest: Quest): boolean {
  if (quest.recurrence === 'once') return quest.completedAt !== null;
  return isSameLocalDay(quest.completedAt);
}

export function getPendingQuests(quests: Quest[]): Quest[] {
  return quests.filter((q) => q.enabled && !q.removed && !isQuestDoneToday(q));
}
