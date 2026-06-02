import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UploadIcon, FileTextIcon } from 'lucide-react';
import { extractTextFromPdf } from '@/lib/pdf';
import { api } from '@/lib/api';

interface Props {
  onUploaded: () => void;
}

export function CvUpload({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  function handleFile(f: File) {
    if (f.type !== 'application/pdf') { setError('Seuls les fichiers PDF sont acceptés.'); return; }
    if (f.size > 5 * 1024 * 1024) { setError('Fichier trop volumineux (max 5 Mo).'); return; }
    setFile(f);
    setError('');
    if (!label) setLabel(f.name.replace(/\.pdf$/i, ''));
  }

  async function handleUpload() {
    if (!file || !label.trim()) return;
    setIsProcessing(true);
    setError('');
    try {
      const content = await extractTextFromPdf(file);
      if (!content) { setError('Impossible d\'extraire le texte du PDF.'); return; }
      await api.cvs.create({ label: label.trim(), filename: file.name, content });
      setFile(null);
      setLabel('');
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'upload');
    } finally {
      setIsProcessing(false);
    }
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
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {file ? (
          <div className="flex items-center justify-center gap-2 text-sm">
            <FileTextIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{file.name}</span>
            <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} Ko)</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <UploadIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Glisse un PDF ici ou <span className="text-foreground underline">clique pour sélectionner</span>
            </p>
            <p className="text-xs text-muted-foreground">PDF uniquement · max 5 Mo</p>
          </div>
        )}
      </div>

      {file && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cv-label">Nom du CV</Label>
          <Input
            id="cv-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ex: CV Développeur, CV Produit…"
          />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {file && (
        <Button onClick={handleUpload} disabled={isProcessing || !label.trim()}>
          {isProcessing ? 'Traitement en cours…' : 'Enregistrer le CV'}
        </Button>
      )}
    </div>
  );
}
