import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ApplicationWithJob } from '@joblog/shared';

export function ContactFields({
  contact,
  disabled,
  onSave,
}: {
  contact: ApplicationWithJob['contact'];
  disabled: boolean;
  onSave: (c: ApplicationWithJob['contact']) => void;
}) {
  const [v, setV] = useState(
    contact ?? { name: null, role: null, email: null, phone: null },
  );
  const [dirty, setDirty] = useState(false);

  function update(field: string, val: string) {
    setV((prev) => ({ ...prev, [field]: val || null }));
    setDirty(true);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {(['name', 'role', 'email', 'phone'] as const).map((field) => (
        <div key={field} className="flex flex-col gap-1.5">
          <Label className="text-xs capitalize">{fieldLabel(field)}</Label>
          <Input
            value={v[field] ?? ''}
            disabled={disabled}
            onChange={(e) => update(field, e.target.value)}
            onBlur={() => {
              if (dirty) {
                onSave(v);
                setDirty(false);
              }
            }}
            className="h-8 text-sm"
            placeholder="—"
          />
        </div>
      ))}
    </div>
  );
}

function fieldLabel(f: string) {
  const map: Record<string, string> = {
    name: 'Nom',
    role: 'Poste',
    email: 'Email',
    phone: 'Téléphone',
  };
  return map[f] ?? f;
}
