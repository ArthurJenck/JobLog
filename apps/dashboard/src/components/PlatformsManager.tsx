import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { AddPlatformForm } from './AddPlatformForm';
import { api } from '@/lib/api';
import type { Platform } from '@/lib/api';
import { ExternalLinkIcon, GlobeIcon, PencilIcon, Trash2Icon, CheckIcon, XIcon } from 'lucide-react';

export function PlatformsManager() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
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

  function startRename(platform: Platform) {
    setRenamingId(platform._id);
    setRenameValue(platform.name);
  }

  async function confirmRename(id: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    await api.platforms.update(id, { name: trimmed });
    setRenamingId(null);
    load();
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
  }

  function openAll() {
    platforms.forEach((platform) => window.open(platform.url, '_blank', 'noopener'));
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
      <div className="flex items-center justify-between gap-2">
        <Button onClick={openAll} disabled={platforms.length === 0}>
          <ExternalLinkIcon className="h-4 w-4" />
          Ouvrir toutes les plateformes
        </Button>
        {platforms.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Annuler' : '+ Ajouter une plateforme'}
          </Button>
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
          {platforms.map((platform) => (
            <div
              key={platform._id}
              className="flex items-center gap-3 rounded-lg border px-4 py-3"
            >
              {platform.faviconUrl && !brokenFavicons.has(platform._id) ? (
                <img
                  src={platform.faviconUrl}
                  alt=""
                  className="h-5 w-5 rounded flex-shrink-0"
                  onError={() =>
                    setBrokenFavicons((prev) => new Set(prev).add(platform._id))
                  }
                />
              ) : (
                <GlobeIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                {renamingId === platform._id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmRename(platform._id);
                        if (e.key === 'Escape') cancelRename();
                      }}
                      className="h-7 text-sm"
                      autoFocus
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => confirmRename(platform._id)}>
                      <CheckIcon className="h-3.5 w-3.5 text-green-600" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelRename}>
                      <XIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium truncate">{platform.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{platform.url}</p>
                  </>
                )}
              </div>
              {renamingId !== platform._id && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0"
                    onClick={() => startRename(platform)}
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
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
