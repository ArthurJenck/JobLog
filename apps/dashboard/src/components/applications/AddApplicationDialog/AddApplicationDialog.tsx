import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ManualForm } from './ManualForm';
import { UrlForm } from './UrlForm';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (applicationId: string) => void;
}

export function AddApplicationDialog({ open, onClose, onCreated }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter une candidature</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="url">
          <TabsList className="w-full">
            <TabsTrigger value="url" className="flex-1">
              Coller une URL
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex-1">
              Saisie manuelle
            </TabsTrigger>
          </TabsList>
          <TabsContent value="manual">
            <ManualForm onCreated={onCreated} />
          </TabsContent>
          <TabsContent value="url">
            <UrlForm open={open} onCreated={onCreated} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
