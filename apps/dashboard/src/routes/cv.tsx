import { createFileRoute } from '@tanstack/react-router';
import { CvManager } from '@/components/CvManager';

export const Route = createFileRoute('/cv')({
  component: CvPage,
});

export function CvPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">CV</h1>
      <CvManager />
    </div>
  );
}
