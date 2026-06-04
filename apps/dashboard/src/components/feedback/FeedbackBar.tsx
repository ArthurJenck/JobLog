import { useCallback, useState } from 'react';
import { Megaphone, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const STORAGE_KEY = 'joblog:feedback-bar-open';
type FeedbackType = 'bug' | 'feedback' | 'feature';

function readStoredOpen(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === 'true';
}

export function FeedbackBar() {
  const [isOpen, setIsOpen] = useState(readStoredOpen);
  const [type, setType] = useState<FeedbackType>('feedback');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setOpenPersisted = useCallback((value: boolean) => {
    setIsOpen(value);
    localStorage.setItem(STORAGE_KEY, String(value));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          message,
          url: window.location.href,
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        }),
      });
      if (res.ok) {
        setMessage('');
        setOpenPersisted(false);
        toast.success('Retour envoyé, merci !');
      } else {
        toast.error("Erreur lors de l'envoi, réessaie dans un instant.");
      }
    } catch {
      toast.error('Erreur réseau, réessaie dans un instant.');
    } finally {
      setSubmitting(false);
    }
  }, [type, message, submitting, setOpenPersisted]);

  return (
    <div
      className="fixed right-4 bottom-12 z-50 flex flex-col items-end gap-2 md:bottom-6"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {isOpen && (
        <div className="flex w-72 flex-col gap-2 rounded-xl border bg-background p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Bug ou idée de feature ?</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full"
              onClick={() => setOpenPersisted(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Select value={type} onValueChange={(v) => setType(v as FeedbackType)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="feedback">Retour</SelectItem>
              <SelectItem value="feature">Idée de feature</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Décris le bug ou ton idée…"
            rows={3}
            className="resize-none text-xs"
            maxLength={2000}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
            }}
          />
          <Button
            size="sm"
            disabled={!message.trim() || submitting}
            onClick={handleSubmit}
            className="h-7 self-end gap-1.5 px-2.5 text-xs"
          >
            <Send className="h-3 w-3" />
            {submitting ? 'Envoi…' : 'Envoyer'}
          </Button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpenPersisted(!isOpen)}
        title="Bug ou idée de feature"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border bg-background text-muted-foreground shadow-md transition-colors hover:bg-accent hover:text-foreground"
      >
        <Megaphone className="h-4 w-4" />
      </button>
    </div>
  );
}
