import type { CheckedState } from '@radix-ui/react-checkbox';
import { Checkbox } from '../ui/checkbox';
import { cn } from '@/lib/utils';

interface CompletionCheckboxProps {
  checked: CheckedState | undefined;
  onCheckedChange(checked: CheckedState): void;
  className?: string;
  silent?: boolean;
}

const CompletionCheckbox = ({
  checked,
  onCheckedChange,
  className,
  silent,
}: CompletionCheckboxProps) => {
  return (
    <Checkbox
      checked={checked}
      silent={silent}
      onCheckedChange={onCheckedChange}
      className={cn(
        'border-green-600 data-[state=checked]:bg-green-600 hover:bg-green-600/15 shrink-0',
        className,
      )}
    />
  );
};

export default CompletionCheckbox;
