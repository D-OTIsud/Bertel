import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Body copy — a sentence stating exactly what the confirm action will do. */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' tints the confirm button red (detach / delete). 'default' uses the accent button. */
  tone?: 'default' | 'danger';
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Reusable confirmation modal for destructive / irreversible-feeling actions (detach a
 * prestataire, remove a link…). Mirrors the EditorModal footer shape (Annuler / action) but
 * carries an explicit message and a danger tone — the codebase had no shared confirm before.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'default',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onCancel(); }}>
      <DialogContent className="object-editor">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="confirm-dialog__message">{message}</p>
        <DialogFooter>
          <button type="button" className="btn" onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn danger' : 'btn primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
