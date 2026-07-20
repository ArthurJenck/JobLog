import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { CvUpload } from './CvUpload';
import { CvSkillsPanel } from './CvSkillsPanel';
import { api } from '@/lib/api';
import type { Cv } from '@joblog/shared';
import { FileTextIcon, Trash2Icon, PencilIcon, CheckIcon, XIcon } from 'lucide-react';

export function CvManager() {
  const [cvs, setCvs] = useState<Omit<Cv, 'content'>[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  async function load() {
    setIsLoading(true);
    try {
      const { data } = await api.cvs.list();
      setCvs(data);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    api.cvs
      .list()
      .then(({ data }) => {
        if (active) setCvs(data);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function deleteCv(id: string) {
    if (!confirm('Supprimer ce CV ?')) return;
    await api.cvs.delete(id);
    load();
  }

  function startRename(cv: Omit<Cv, 'content'>) {
    setRenamingId(cv._id);
    setRenameValue(cv.label);
  }

  async function confirmRename(id: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    await api.cvs.update(id, { label: trimmed });
    setRenamingId(null);
    load();
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {cvs.length === 0 ? (
        <CvUpload onUploaded={() => load()} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {cvs.length} CV{cvs.length > 1 ? 's' : ''}
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowUpload((v) => !v)}>
              {showUpload ? 'Annuler' : '+ Ajouter un CV'}
            </Button>
          </div>

          {showUpload && (
            <>
              <CvUpload onUploaded={() => { setShowUpload(false); load(); }} />
              <Separator />
            </>
          )}

          <div className="flex flex-col gap-2">
            {cvs.map((cv) => (
              <div
                key={cv._id}
                className="flex items-center gap-3 rounded-lg border px-4 py-3"
              >
                <FileTextIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  {renamingId === cv._id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmRename(cv._id);
                          if (e.key === 'Escape') cancelRename();
                        }}
                        className="h-7 text-sm"
                        autoFocus
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => confirmRename(cv._id)}>
                        <CheckIcon className="h-3.5 w-3.5 text-green-600" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelRename}>
                        <XIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium truncate">{cv.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{cv.filename}</p>
                    </>
                  )}
                </div>
                {renamingId !== cv._id && (
                  <>
                    <p className="text-xs text-muted-foreground flex-shrink-0">
                      {new Date(cv.uploadedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0"
                      onClick={() => startRename(cv)}
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                      onClick={() => deleteCv(cv._id)}
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>

          <Separator />
          <CvSkillsPanel cvs={cvs} />
        </>
      )}
    </div>
  );
}
