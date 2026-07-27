import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { AddPlatformForm } from './AddPlatformForm';
import { api } from '@/lib/api';
import type { Platform } from '@/lib/api';
import {
  ExternalLinkIcon,
  GlobeIcon,
  PencilIcon,
  Trash2Icon,
  CheckIcon,
  XIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from 'lucide-react';
import { toast } from 'sonner';

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

  async function deletePlatform(id: string) {
    if (!confirm('Supprimer cette plateforme ?')) return;
    await api.platforms.delete(id);
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
      toast.error('URL invalide');
      return;
    }
    await api.platforms.update(id, { name: trimmedName, url: trimmedUrl });
    setEditingId(null);
    load();
  }

  function cancelEdit() {
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

  function openAll() {
    platforms.forEach((platform) => openInNewTab(platform.url));
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= platforms.length) return;

    const reordered = [...platforms];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setPlatforms(reordered);

    try {
      await api.platforms.reorder(reordered.map((p) => p._id));
    } catch {
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
        <div className="flex items-center justify-between gap-2">
          <Button onClick={openAll} disabled={platforms.length === 0}>
            <ExternalLinkIcon className="h-4 w-4" />
            Ouvrir toutes les plateformes
          </Button>
          {platforms.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdd((v) => !v)}
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
        <div className="flex flex-col gap-2">
          {platforms.map((platform, index) => (
            <div
              key={platform._id}
              className="flex items-center gap-3 rounded-lg border px-4 py-3"
            >
              {editingId !== platform._id && (
                <div className="flex flex-col shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-7 text-muted-foreground hover:text-foreground [&_svg]:size-auto"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUpIcon size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-7 text-muted-foreground hover:text-foreground [&_svg]:size-auto"
                    disabled={index === platforms.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownIcon size={16} />
                  </Button>
                </div>
              )}
              {platform.faviconUrl && !brokenFavicons.has(platform._id) ? (
                <img
                  src={platform.faviconUrl}
                  alt=""
                  className="h-5 w-5 rounded shrink-0"
                  onError={() =>
                    setBrokenFavicons((prev) => new Set(prev).add(platform._id))
                  }
                />
              ) : (
                <GlobeIcon className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                {editingId === platform._id ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmEdit(platform._id);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="h-7 text-sm"
                        placeholder="Nom"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => confirmEdit(platform._id)}
                      >
                        <CheckIcon className="h-3.5 w-3.5 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={cancelEdit}
                      >
                        <XIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                    <Input
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmEdit(platform._id);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      className="h-7 text-xs"
                      placeholder="URL"
                    />
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium truncate">
                      {platform.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {platform.url}
                    </p>
                  </>
                )}
              </div>
              {editingId !== platform._id && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => openInNewTab(platform.url)}
                  >
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => startEdit(platform)}
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => deletePlatform(platform._id)}
                  >
                    <Trash2Icon className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
