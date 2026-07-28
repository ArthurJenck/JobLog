import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

export function NotesField({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <Textarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(v)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && v !== value) onSave(v);
      }}
      placeholder="Notes libres…"
      className="resize-none text-sm min-h-24"
    />
  );
}
