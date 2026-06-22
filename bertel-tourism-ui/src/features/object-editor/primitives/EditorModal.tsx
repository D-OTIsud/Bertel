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
  /** 'lg' widens the dialog (max-w-2xl), 'xl' wider still (max-w-4xl) — for content that needs room,
   *  e.g. the rich-text description editor or a map. Default keeps max-w-lg used by record modals. */
  size?: 'default' | 'lg' | 'xl';
  children: ReactNode;
}

const SIZE_CLASS: Record<'default' | 'lg' | 'xl', string> = {
  default: 'object-editor',
  lg: 'object-editor max-w-2xl',
  xl: 'object-editor max-w-4xl',
};

/** Focused add/edit modal for editor sub-records (media, rooms). Save/Cancel footer. */
export function EditorModal({ open, title, onClose, onSave, saveLabel = 'Enregistrer', saveDisabled = false, size = 'default', children }: EditorModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <DialogContent className={SIZE_CLASS[size]}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="ed-modal__body">{children}</div>
        <DialogFooter>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="button" className="btn primary" onClick={onSave} disabled={saveDisabled}>{saveLabel}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
