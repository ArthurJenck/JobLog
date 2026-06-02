import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Candidatures</h1>
      <p className="text-muted-foreground">Dashboard en cours de construction…</p>
    </div>
  );
}
