import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UploadIcon, FileTextIcon, XIcon } from 'lucide-react';
import { extractTextFromPdf } from '@/lib/pdf';
import { api } from '@/lib/api';

interface Props {
  onUploaded: () => void;
}

interface PendingFile {
  id: string;
  file: File;
  label: string;
  error: string;
}

function validateFile(f: File): string {
  if (f.type !== 'application/pdf') return 'Seuls les fichiers PDF sont acceptés.';
  if (f.size > 5 * 1024 * 1024) return 'Fichier trop volumineux (max 5 Mo).';
  return '';
}

export function CvUpload({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState('');

  function addFiles(fileList: FileList | File[]) {
    setGlobalError('');
    const rejected: string[] = [];
    const accepted: PendingFile[] = [];

    for (const f of Array.from(fileList)) {
      const error = validateFile(f);
      if (error) {
        rejected.push(`${f.name} : ${error}`);
        continue;
      }
      accepted.push({
        id: `${f.name}-${f.size}-${f.lastModified}`,
        file: f,
        label: f.name.replace(/\.pdf$/i, ''),
        error: '',
      });
    }

    if (rejected.length > 0) setGlobalError(rejected.join(' '));
    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted.filter((a) => !prev.some((p) => p.id === a.id))]);
    }
  }

  function updateLabel(id: string, label: string) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, label } : f)));
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleUpload() {
    const uploadable = files.filter((f) => f.label.trim());
    if (uploadable.length === 0) return;

    setIsProcessing(true);
    setGlobalError('');

    const failed: PendingFile[] = [];
    for (const pending of uploadable) {
      try {
        const content = await extractTextFromPdf(pending.file);
        if (!content) throw new Error('Impossible d\'extraire le texte du PDF.');
        await api.cvs.create({ label: pending.label.trim(), filename: pending.file.name, content });
      } catch (e) {
        failed.push({
          ...pending,
          error: e instanceof Error ? e.message : 'Erreur lors de l\'upload',
        });
      }
    }

    setFiles(failed);
    setIsProcessing(false);
    if (failed.length < uploadable.length) onUploaded();
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="flex flex-col items-center gap-2">
          <UploadIcon className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Glisse un ou plusieurs PDF ici ou <span className="text-foreground underline">clique pour sélectionner</span>
          </p>
          <p className="text-xs text-muted-foreground">PDF uniquement · max 5 Mo par fichier</p>
        </div>
      </div>

      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          {files.map((f) => (
            <div key={f.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FileTextIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Input
                  value={f.label}
                  onChange={(e) => updateLabel(f.id, e.target.value)}
                  placeholder="ex: CV Développeur, CV Produit…"
                  className="h-8 text-sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeFile(f.id)}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
              {f.error && <p className="pl-6 text-xs text-destructive">{f.error}</p>}
            </div>
          ))}
        </div>
      )}

      {globalError && <p className="text-sm text-destructive">{globalError}</p>}

      {files.length > 0 && (
        <Button onClick={handleUpload} disabled={isProcessing || files.every((f) => !f.label.trim())}>
          {isProcessing
            ? 'Traitement en cours…'
            : files.length > 1
              ? `Enregistrer les ${files.length} CV`
              : 'Enregistrer le CV'}
        </Button>
      )}
    </div>
  );
}
