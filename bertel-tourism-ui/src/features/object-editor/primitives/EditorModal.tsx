import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';

interface EditorModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  /** Disables the save/validate action — used for read-only modals with no write path. */
  saveDisabled?: boolean;
  children: ReactNode;
}

/** Focused add/edit modal for editor sub-records (media, rooms). Save/Cancel footer. */
export function EditorModal({ open, title, onClose, onSave, saveLabel = 'Enregistrer', saveDisabled = false, children }: EditorModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="ed-modal__body">{children}</div>
        <DialogFooter>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Annuler</button>
          <button type="button" className="btn btn--primary" onClick={onSave} disabled={saveDisabled}>{saveLabel}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
