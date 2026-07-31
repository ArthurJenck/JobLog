import { FlameIcon } from 'lucide-react';

export function ToonFlame() {
  return (
    <div className="relative h-4 w-4 shrink-0">
      <FlameIcon className="absolute inset-0 h-4 w-4 origin-bottom fill-orange-500 text-orange-600" />
      <FlameIcon className="absolute inset-0 h-4 w-4 origin-bottom scale-[0.5] fill-yellow-300 text-yellow-400" />
    </div>
  );
}
