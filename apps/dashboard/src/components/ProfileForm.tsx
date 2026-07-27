import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { resetUserCache } from '@/hooks/use-user';
import type { Sex, UserProfile } from '@/lib/user';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const FIRST_NAME_SAVE_DELAY_MS = 600;

interface ProfileFormProps {
  user: UserProfile;
}

export function ProfileForm({ user }: ProfileFormProps) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [sex, setSex] = useState<Sex>(user.sex);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, []);

  async function save(payload: { firstName: string; sex: Sex }) {
    try {
      const res = await fetch('/api/auth/update-user', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('update failed');
      resetUserCache();
      toast.success('Profil mis à jour');
    } catch {
      toast.error('Impossible de mettre à jour le profil');
    }
  }

  function handleFirstNameChange(value: string) {
    setFirstName(value);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      save({ firstName: value.trim(), sex });
    }, FIRST_NAME_SAVE_DELAY_MS);
  }

  function handleSexChange(value: Sex) {
    setSex(value);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    save({ firstName: firstName.trim(), sex: value });
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="first-name">Prénom</Label>
        <Input
          id="first-name"
          value={firstName}
          onChange={(e) => handleFirstNameChange(e.target.value)}
          placeholder="Ton prénom"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sex">Sexe</Label>
        <Select
          value={sex}
          onValueChange={(value) => handleSexChange(value as Sex)}
        >
          <SelectTrigger id="sex">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="male">Masculin</SelectItem>
            <SelectItem value="female">Féminin</SelectItem>
            <SelectItem value="unspecified">Non défini</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
