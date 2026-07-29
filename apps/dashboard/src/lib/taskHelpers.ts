import { isSameLocalDay } from './platformReminder';
import type { Task } from './api';

export function isTaskDoneToday(task: Task): boolean {
  if (task.recurrence === 'once') return task.completedAt !== null;
  return isSameLocalDay(task.completedAt);
}

export function getPendingTasks(tasks: Task[]): Task[] {
  return tasks.filter((q) => q.enabled && !q.removed && !isTaskDoneToday(q));
}
