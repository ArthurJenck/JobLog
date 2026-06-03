import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CvUpload } from './CvUpload';
import { api } from '@/lib/api';
import type { Cv } from '@joblog/shared';
import { FileTextIcon, Trash2Icon } from 'lucide-react';

export function CvManager() {
  const [cvs, setCvs] = useState<Omit<Cv, 'content'>[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {cvs.length === 0 ? 'Aucun CV enregistré.' : `${cvs.length} CV${cvs.length > 1 ? 's' : ''}`}
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {cvs.map((cv) => (
            <div
              key={cv._id}
              className="flex items-center gap-3 rounded-lg border px-4 py-3"
            >
              <FileTextIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{cv.label}</p>
                <p className="text-xs text-muted-foreground truncate">{cv.filename}</p>
              </div>
              <p className="text-xs text-muted-foreground flex-shrink-0">
                {new Date(cv.uploadedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                onClick={() => deleteCv(cv._id)}
              >
                <Trash2Icon className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
