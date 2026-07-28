import { useEffect, useMemo, useState } from 'react';
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
import { Card, CardContent } from '@/components/ui/card';
import { PlatformRow } from './PlatformRow';
import { AddPlatformForm } from './AddPlatformForm';
import { api } from '@/lib/api';
import type { Platform } from '@/lib/api';
import { ExternalLinkIcon, PartyPopperIcon } from 'lucide-react';
import { toast } from 'sonner';
import { isSameLocalDay } from '@/lib/platformReminder';
import { randomCelebration } from '@/lib/celebrationMessages';
import {
  playDelete,
  playDrop,
  playError,
  playPageOpen,
  playAdd,
  playCancel,
} from '@/lib/sound';
import { useUser } from '@/hooks/use-user';
import { useAllDoneCelebration } from '@/hooks/useAllDoneCelebration';
import { useQuests } from '@/lib/app-context';

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function PlatformsManager() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [brokenFavicons, setBrokenFavicons] = useState<Set<string>>(new Set());
  const { refreshQuests } = useQuests();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function load() {
    setIsLoading(true);
    try {
      const { data } = await api.platforms.list();
      setPlatforms(data);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    api.platforms
      .list()
      .then(({ data }) => {
        if (active) setPlatforms(data);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const { user } = useUser();
  const allChecked =
    platforms.length > 0 && platforms.every((p) => isSameLocalDay(p.checkedAt));
  const celebrationMessage = useMemo(
    () => (allChecked ? randomCelebration(user) : null),
    [allChecked, user],
  );

  useAllDoneCelebration(allChecked);

  async function deletePlatform(id: string) {
    if (!confirm('Supprimer cette plateforme ?')) return;
    await api.platforms.delete(id);
    playDelete();
    load();
  }

  function startEdit(platform: Platform) {
    setEditingId(platform._id);
    setEditName(platform.name);
    setEditUrl(platform.url);
  }

  async function confirmEdit(id: string) {
    const trimmedName = editName.trim();
    const trimmedUrl = editUrl.trim();
    if (!trimmedName) return;
    if (!isValidUrl(trimmedUrl)) {
      playError();
      toast.error('URL invalide');
      return;
    }
    await api.platforms.update(id, { name: trimmedName, url: trimmedUrl });
    playAdd();
    setEditingId(null);
    load();
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
    setPlatforms((prev) =>
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
    setPlatforms((prev) => prev.map((p) => ({ ...p, lastClickedAt: now })));
    api.platforms.markAllClicked().catch(() => {
      playError();
      toast.error("Impossible d'enregistrer l'ouverture");
    });
  }

  async function toggleChecked(platform: Platform, checked: boolean) {
    const now = new Date().toISOString();
    setPlatforms((prev) =>
      prev.map((p) =>
        p._id === platform._id ? { ...p, checkedAt: checked ? now : null } : p,
      ),
    );
    try {
      await api.platforms.setChecked(platform._id, checked);
      void refreshQuests();
    } catch {
      playError();
      toast.error('Impossible de mettre à jour la plateforme');
      load();
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = platforms.findIndex((p) => p._id === active.id);
    const newIndex = platforms.findIndex((p) => p._id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(platforms, oldIndex, newIndex);
    setPlatforms(reordered);
    playDrop();

    try {
      await api.platforms.reorder(reordered.map((p) => p._id));
    } catch {
      playError();
      toast.error('Impossible de réorganiser les plateformes');
      load();
    }
  }

  async function handlePlatformAdded() {
    await load();
    setShowAdd(true);
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
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

      {celebrationMessage && (
        <Card className="border-green-600/40 bg-green-600/5 shadow-none">
          <CardContent className="flex items-center gap-3 py-4 text-green-600">
            <PartyPopperIcon className="h-5 w-5  shrink-0" />
            <p className="text-sm font-medium">{celebrationMessage}</p>
          </CardContent>
        </Card>
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
