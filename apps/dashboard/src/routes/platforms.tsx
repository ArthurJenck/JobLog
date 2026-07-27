import { createFileRoute } from '@tanstack/react-router';
import { PlatformsManager } from '@/components/PlatformsManager';

export const Route = createFileRoute('/platforms')({
  component: PlatformsPage,
});

export function PlatformsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Plateformes</h1>
      <PlatformsManager />
    </div>
  );
}
