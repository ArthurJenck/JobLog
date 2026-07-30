import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { localDayKey } from '@joblog/shared';
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
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PlatformRow } from './PlatformRow';
import { AddPlatformForm } from './AddPlatformForm';
import { api } from '@/lib/api';
import type { Platform } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { ExternalLinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { isSameLocalDay } from '@/lib/platformReminder';
import {
  playDelete,
  playDrop,
  playError,
  playPageOpen,
  playAdd,
  playCancel,
} from '@/lib/sound';
import { useAllDoneCelebration } from '@/hooks/useAllDoneCelebration';
import { useConfirm } from '@/hooks/useConfirm';

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function PlatformsManager() {
  const qc = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [brokenFavicons, setBrokenFavicons] = useState<Set<string>>(new Set());

  const platformsQuery = useQuery({
    queryKey: qk.platforms.all,
    queryFn: () => api.platforms.list().then((r) => r.data),
  });
  const platforms = platformsQuery.data ?? [];

  const setPlatformsData = (updater: (prev: Platform[]) => Platform[]) =>
    qc.setQueryData<Platform[]>(qk.platforms.all, (prev) => updater(prev ?? []));
  const invalidatePlatforms = () =>
    qc.invalidateQueries({ queryKey: qk.platforms.all });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const allChecked =
    platforms.length > 0 && platforms.every((p) => isSameLocalDay(p.checkedAt));

  useAllDoneCelebration(allChecked);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.platforms.delete(id),
    onSuccess: async () => {
      playDelete();
      await invalidatePlatforms();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name, url }: { id: string; name: string; url: string }) =>
      api.platforms.update(id, { name, url }),
    onSuccess: async () => {
      playAdd();
      setEditingId(null);
      await invalidatePlatforms();
    },
  });

  async function deletePlatform(id: string) {
    const ok = await confirm({
      title: 'Supprimer cette plateforme ?',
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    deleteMutation.mutate(id);
  }

  function startEdit(platform: Platform) {
    setEditingId(platform._id);
    setEditName(platform.name);
    setEditUrl(platform.url);
  }

  function confirmEdit(id: string) {
    const trimmedName = editName.trim();
    const trimmedUrl = editUrl.trim();
    if (!trimmedName) return;
    if (!isValidUrl(trimmedUrl)) {
      playError();
      toast.error('URL invalide');
      return;
    }
    updateMutation.mutate({ id, name: trimmedName, url: trimmedUrl });
  }

  function cancelEdit() {
    playCancel();
    setEditingId(null);
    setEditName('');
    setEditUrl('');
  }

  function openInNewTab(url: string) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  }

  function openPlatform(platform: Platform) {
    openInNewTab(platform.url);
    playPageOpen();
    const now = new Date().toISOString();
    setPlatformsData((prev) =>
      prev.map((p) =>
        p._id === platform._id ? { ...p, lastClickedAt: now } : p,
      ),
    );
    api.platforms.markClicked(platform._id).catch(() => {
      playError();
      toast.error("Impossible d'enregistrer l'ouverture");
    });
  }

  function openAll() {
    platforms.forEach((platform) => openInNewTab(platform.url));
    playPageOpen();
    const now = new Date().toISOString();
    setPlatformsData((prev) => prev.map((p) => ({ ...p, lastClickedAt: now })));
    api.platforms.markAllClicked().catch(() => {
      playError();
      toast.error("Impossible d'enregistrer l'ouverture");
    });
  }

  async function toggleChecked(platform: Platform, checked: boolean) {
    const now = new Date().toISOString();
    setPlatformsData((prev) =>
      prev.map((p) =>
        p._id === platform._id ? { ...p, checkedAt: checked ? now : null } : p,
      ),
    );
    try {
      await api.platforms.setChecked(platform._id, checked);
      void qc.invalidateQueries({ queryKey: qk.tasks(localDayKey()) });
    } catch {
      playError();
      toast.error('Impossible de mettre à jour la plateforme');
      void invalidatePlatforms();
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = platforms.findIndex((p) => p._id === active.id);
    const newIndex = platforms.findIndex((p) => p._id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(platforms, oldIndex, newIndex);
    setPlatformsData(() => reordered);
    playDrop();

    try {
      await api.platforms.reorder(reordered.map((p) => p._id));
    } catch {
      playError();
      toast.error('Impossible de réorganiser les plateformes');
      void invalidatePlatforms();
    }
  }

  async function handlePlatformAdded() {
    await invalidatePlatforms();
    setShowAdd(true);
  }

  if (platformsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {confirmDialog}
      <div className="flex flex-col gap-1">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <Button
            onClick={openAll}
            disabled={platforms.length === 0}
            className="w-full sm:w-auto"
          >
            <ExternalLinkIcon className="h-4 w-4" />
            Ouvrir toutes les plateformes
          </Button>
          {platforms.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdd((v) => !v)}
              className="w-full sm:w-auto"
            >
              {showAdd ? 'Annuler' : '+ Ajouter une plateforme'}
            </Button>
          )}
        </div>
        {platforms.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Si certains onglets ne s'ouvrent pas : autorisez les popups et
            redirections pour ce site dans les réglages de votre navigateur.
          </p>
        )}
      </div>

      {(platforms.length === 0 || showAdd) && (
        <>
          <AddPlatformForm onAdded={handlePlatformAdded} />
          <Separator />
        </>
      )}

      {platforms.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune plateforme enregistrée pour le moment.
        </p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext
            items={platforms.map((p) => p._id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {platforms.map((platform) => (
                <PlatformRow
                  key={platform._id}
                  platform={platform}
                  isEditing={editingId === platform._id}
                  editName={editName}
                  editUrl={editUrl}
                  onEditNameChange={setEditName}
                  onEditUrlChange={setEditUrl}
                  onConfirmEdit={() => confirmEdit(platform._id)}
                  onCancelEdit={cancelEdit}
                  onStartEdit={() => startEdit(platform)}
                  onDelete={() => deletePlatform(platform._id)}
                  onOpen={() => openPlatform(platform)}
                  onToggleChecked={(checked) =>
                    toggleChecked(platform, checked)
                  }
                  willCompleteAll={
                    !isSameLocalDay(platform.checkedAt) &&
                    platforms.every(
                      (p) =>
                        p._id === platform._id || isSameLocalDay(p.checkedAt),
                    )
                  }
                  faviconBroken={brokenFavicons.has(platform._id)}
                  onFaviconError={() =>
                    setBrokenFavicons((prev) => new Set(prev).add(platform._id))
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
