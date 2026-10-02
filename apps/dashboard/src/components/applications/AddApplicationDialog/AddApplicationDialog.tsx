import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ManualForm } from './ManualForm';
import { UrlForm } from './UrlForm';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (applicationId: string) => void;
  handoffToken?: string;
}

export function AddApplicationDialog({ open, onClose, onCreated, handoffToken }: Props) {
  const [tab, setTab] = useState('url');
  const [manualUrl, setManualUrl] = useState('');
  const handoffQuery = useQuery({
    queryKey: qk.manualHandoffs.detail(handoffToken ?? 'none'),
    queryFn: () => api.manualHandoffs.get(handoffToken!),
    enabled: open && Boolean(handoffToken),
  });

  function close() {
    setTab('url');
    setManualUrl('');
    onClose();
  }

  function switchToManual(url: string) {
    setManualUrl(url);
    setTab('manual');
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter une candidature</DialogTitle>
        </DialogHeader>
        <Tabs value={handoffToken ? 'manual' : tab} onValueChange={setTab}>
          {!handoffToken && <TabsList className="w-full">
            <TabsTrigger value="url" className="flex-1">
              Coller une URL
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex-1">
              Saisie manuelle
            </TabsTrigger>
          </TabsList>}
          <TabsContent value="manual">
            {handoffToken && handoffQuery.isPending ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Chargement du brouillon…</p>
            ) : handoffToken && handoffQuery.isError ? (
              <p className="py-6 text-center text-sm text-destructive">
                Ce brouillon est introuvable ou a expiré.
              </p>
            ) : (
              <ManualForm
                key={handoffToken ?? manualUrl}
                onCreated={onCreated}
                initialUrl={manualUrl}
                initialDraft={handoffQuery.data?.draft}
                handoffToken={handoffToken}
              />
            )}
          </TabsContent>
          <TabsContent value="url">
            <UrlForm open={open} onCreated={onCreated} onSwitchToManual={switchToManual} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
