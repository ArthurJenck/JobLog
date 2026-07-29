import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { TASK_CATALOG } from '@joblog/shared';
import type { TaskRecurrence } from '@joblog/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { TaskConfigRow } from '@/components/tasks/TaskConfigRow';
import { useTasks } from '@/lib/app-context';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { FlameIcon } from 'lucide-react';
import { playAdd, playDelete, playDrop, playError, playToggle } from '@/lib/sound';
import { cn } from '@/lib/utils';

export function TasksManager() {
  const { tasks, refreshTasks, toggleTaskCompleted, updateTask, deleteTask } = useTasks();
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('daily');
  const [target, setTarget] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortedTasks = [...tasks].filter((q) => !q.removed).sort((a, b) => a.order - b.order);
  const availableCatalog = TASK_CATALOG.filter(
    (entry) => !tasks.some((q) => q.key === entry.key && !q.removed),
  );

  async function activateCatalogTask(key: string) {
    try {
      await api.tasks.activateCatalogTask(key);
      playAdd();
      await refreshTasks();
    } catch {
      playError();
      toast.error("Impossible d'activer cette tâche");
    }
  }

  async function handleDeleteTask(id: string) {
    if (!confirm('Supprimer cette tâche ?')) return;
    playDelete();
    await deleteTask(id);
  }

  async function removeTask(id: string) {
    playDelete();
    await updateTask(id, { removed: true });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedTasks.findIndex((q) => q._id === active.id);
    const newIndex = sortedTasks.findIndex((q) => q._id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sortedTasks, oldIndex, newIndex);
    playDrop();
    try {
      await api.tasks.reorder(reordered.map((q) => q._id));
      await refreshTasks();
    } catch {
      playError();
      toast.error('Impossible de réorganiser les tâches');
    }
  }

  async function submitCustomTask() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    try {
      await api.tasks.createCustom({
        title: trimmed,
        recurrence,
        target: target.trim() === '' ? null : Number(target),
      });
      playAdd();
      setTitle('');
      setTarget('');
      setRecurrence('daily');
      setShowAdd(false);
      await refreshTasks();
    } catch {
      playError();
      toast.error("Impossible d'ajouter cette tâche");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="rounded-lg border p-4 flex items-start gap-3 bg-muted/30">
        <FlameIcon className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Ta flamme s'entretient simplement en te connectant chaque jour. Quand tu valides
          toutes tes tâches quotidiennes, elle devient dorée pour la journée. Si elle était dorée
          hier mais pas encore aujourd'hui, elle vacille pour te rappeler de la raviver.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Mes tâches</h2>
          <Button variant="outline" size="sm" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Annuler' : '+ Ajouter une tâche personnalisée'}
          </Button>
        </div>

        {showAdd && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="task-title">
                Titre
              </label>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : Refaire mon CV"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-md border overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    playToggle();
                    setRecurrence('once');
                  }}
                  className={cn(
                    'px-2 py-1 text-xs',
                    recurrence === 'once'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground',
                  )}
                >
                  Ponctuelle
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playToggle();
                    setRecurrence('daily');
                  }}
                  className={cn(
                    'px-2 py-1 text-xs',
                    recurrence === 'daily'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground',
                  )}
                >
                  Quotidienne
                </button>
              </div>
              <Input
                type="number"
                min={1}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Objectif (facultatif)"
                className="h-8 w-40 text-sm"
              />
            </div>
            <Button
              size="sm"
              onClick={submitCustomTask}
              disabled={!title.trim() || isSubmitting}
              className="self-start"
            >
              Ajouter
            </Button>
          </div>
        )}

        {sortedTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune tâche configurée.</p>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext
              items={sortedTasks.map((q) => q._id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {sortedTasks.map((task) => (
                  <TaskConfigRow
                    key={task._id}
                    task={task}
                    onUpdate={(body) => updateTask(task._id, body)}
                    onToggleCompleted={(completed) => toggleTaskCompleted(task, completed)}
                    onDelete={() => handleDeleteTask(task._id)}
                    onRemove={() => removeTask(task._id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {availableCatalog.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Catalogue disponible</h2>
            <div className="flex flex-col gap-2">
              {availableCatalog.map((entry) => (
                <div
                  key={entry.key}
                  className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{entry.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.recurrence === 'daily' ? 'Quotidienne' : 'Ponctuelle'}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => activateCatalogTask(entry.key)}>
                    Activer
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
