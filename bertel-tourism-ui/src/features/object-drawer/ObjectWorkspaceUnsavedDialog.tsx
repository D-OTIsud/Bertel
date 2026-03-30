import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ObjectWorkspaceUnsavedDialogProps {
  open: boolean;
  saving: boolean;
  canSaveAndContinue: boolean;
  onStay: () => void;
  onDiscard: () => void;
  onSaveAndContinue: () => void;
}

export function ObjectWorkspaceUnsavedDialog({
  open,
  saving,
  canSaveAndContinue,
  onStay,
  onDiscard,
  onSaveAndContinue,
}: ObjectWorkspaceUnsavedDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onStay(); }}>
      <DialogContent className="max-w-md" showClose={false}>
        <DialogTitle>Modifications non sauvegardees</DialogTitle>
        <DialogDescription>
          Cet onglet contient des changements locaux. Vous pouvez revenir sur l'onglet, abandonner ces changements, ou enregistrer avant de continuer.
        </DialogDescription>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onStay}>
            Rester sur l'onglet
          </Button>
          <Button type="button" variant="outline" onClick={onDiscard} disabled={saving}>
            Abandonner
          </Button>
          <Button type="button" onClick={onSaveAndContinue} disabled={saving || !canSaveAndContinue}>
            {saving ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
