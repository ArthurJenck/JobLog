import { CrownIcon } from 'lucide-react';

export function ToonCrown() {
  return (
    <div className="relative h-4 w-4 shrink-0">
      <CrownIcon className="absolute inset-0 h-4 w-4 origin-bottom fill-amber-400 text-amber-500" />
      <CrownIcon className="absolute inset-0 h-4 w-4 origin-bottom scale-[0.5] fill-yellow-200 text-yellow-300" />
    </div>
  );
}
