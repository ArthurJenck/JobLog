import { createFileRoute } from '@tanstack/react-router';
import { TasksManager } from '@/components/TasksManager';

export const Route = createFileRoute('/tasks')({
  component: TasksPage,
});

export function TasksPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Tâches</h1>
      <TasksManager />
    </div>
  );
}
