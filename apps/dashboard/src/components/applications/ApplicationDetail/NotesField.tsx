import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

export function NotesField({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled: boolean;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);

  return (
    <Textarea
      value={v}
      disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== value) onSave(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && v !== value) {
          onSave(v);
          e.currentTarget.blur();
        }
      }}
      placeholder="Notes libres…"
      className="resize-none text-sm min-h-24"
    />
  );
}
