import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AddressInput } from '@/components/common/AddressInput';
import { CONTRACT_TYPES, CONTRACT_LABELS, REMOTE_TYPES, REMOTE_LABELS } from '@joblog/shared';

export interface JobPostingFieldsValues {
  title: string;
  location: string;
  url: string;
  contract_type: string;
  remote: string;
}

interface Props {
  values: JobPostingFieldsValues;
  onChange: (field: keyof JobPostingFieldsValues, value: string) => void;
  renderCompanyField: () => ReactNode;
  compact?: boolean;
  urlError?: string;
}

export function JobPostingFields({
  values,
  onChange,
  renderCompanyField,
  compact,
  urlError,
}: Props) {
  const inputClassName = compact ? 'h-8 text-sm' : undefined;
  const labelClassName = compact ? 'text-xs' : undefined;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className={labelClassName}>Poste *</Label>
        <Input
          value={values.title}
          onChange={(e) => onChange('title', e.target.value)}
          required
          placeholder="Développeur Frontend"
          className={inputClassName}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className={labelClassName}>Entreprise *</Label>
        {renderCompanyField()}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className={labelClassName}>Lieu</Label>
        <AddressInput
          value={values.location}
          onChange={(value) => onChange('location', value)}
          placeholder="Paris, France"
          inputClassName={inputClassName}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className={labelClassName}>URL de l'offre</Label>
        <Input
          value={values.url}
          onChange={(e) => onChange('url', e.target.value)}
          placeholder="https://…"
          type="url"
          className={inputClassName}
        />
        {urlError && <p className="text-xs text-destructive">{urlError}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className={labelClassName}>Contrat</Label>
        <Select
          value={values.contract_type}
          onValueChange={(v) => onChange('contract_type', v === '__none__' ? '' : v)}
        >
          <SelectTrigger className={inputClassName}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {CONTRACT_TYPES.map((c) => (
              <SelectItem key={c} value={c}>
                {CONTRACT_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className={labelClassName}>Remote</Label>
        <Select
          value={values.remote}
          onValueChange={(v) => onChange('remote', v === '__none__' ? '' : v)}
        >
          <SelectTrigger className={inputClassName}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {REMOTE_TYPES.map((r) => (
              <SelectItem key={r} value={r}>
                {REMOTE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
