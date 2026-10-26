import { createContext, useContext, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../components/ui/dialog';
import './editor-modal.css';

/** React context also reaches dialogs portaled outside the editor DOM. */
export const EditorModalContext = createContext<string | null>(null);

interface EditorModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  /** Context above the title; keep it factual (never sample object names). */
  eyebrow?: ReactNode;
  description?: string;
  /** Optional live preview, using the same draft as the form. */
  aside?: ReactNode;
  footerNote?: ReactNode;
  /** Keep an existing feature's CSS namespace on the portaled dialog. */
  className?: string;
  /** Disables the save/validate action — used for read-only modals with no write path. */
  saveDisabled?: boolean;
  /** 'lg' widens the dialog (max-w-2xl), 'xl' wider still (max-w-4xl) — for content that needs room,
   *  e.g. the rich-text description editor or a map. Default keeps max-w-lg used by record modals. */
  size?: 'default' | 'lg' | 'xl';
  children: ReactNode;
}

const SIZE_CLASS: Record<'default' | 'lg' | 'xl', string> = {
  default: 'ed-record-modal--default',
  lg: 'ed-record-modal--lg',
  xl: 'ed-record-modal--xl',
};

/** Focused add/edit modal for editor sub-records (media, rooms). Save/Cancel footer. */
export function EditorModal({
  open,
  title,
  onClose,
  onSave,
  saveLabel = 'Enregistrer',
  saveDisabled = false,
  size = 'default',
  eyebrow,
  description,
  aside,
  footerNote,
  className,
  children,
}: EditorModalProps) {
  const descriptionId = useId();
  const openerRef = useRef<HTMLElement | null>(null);
  const objectContext = useContext(EditorModalContext);
  const context = objectContext || eyebrow;
  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        showClose={false}
        overlayClassName="ed-record-modal-overlay"
        aria-describedby={description ? descriptionId : undefined}
        className={`object-editor ed-record-modal ${SIZE_CLASS[size]}${aside ? ' ed-record-modal--preview' : ''}${className ? ` ${className}` : ''}`}
        onOpenAutoFocus={(event) => {
          openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          const content = event.target instanceof HTMLElement ? event.target : null;
          const firstControl = [
            ...(content?.querySelectorAll<HTMLElement>(
              '.ed-modal__body button:not([disabled]), .ed-modal__body input:not([disabled]):not([readonly]), .ed-modal__body select:not([disabled]), .ed-modal__body textarea:not([disabled]):not([readonly])',
            ) ?? []),
          ].find(
            (element) => !element.closest('[hidden], details:not([open])') && !element.matches(':disabled'),
          );
          if (firstControl) {
            event.preventDefault();
            firstControl.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          if (openerRef.current?.isConnected) {
            event.preventDefault();
            openerRef.current.focus();
          }
        }}
      >
        <header className="ed-record-modal__header">
          <div>
            {context && <div className="ed-record-modal__eyebrow">{context}</div>}
            <DialogTitle className="ed-record-modal__title">{title}</DialogTitle>
            {description && (
              <DialogDescription id={descriptionId} className="ed-record-modal__description">
                {description}
              </DialogDescription>
            )}
          </div>
          <DialogClose asChild>
            <button type="button" className="ed-record-modal__close" aria-label="Fermer la fenêtre">
              <X size={18} aria-hidden />
            </button>
          </DialogClose>
        </header>
        <div className="ed-record-modal__layout">
          <div className="ed-modal__body">{children}</div>
          {aside && (
            <aside className="ed-record-modal__aside" aria-label="Aperçu">
              {aside}
            </aside>
          )}
        </div>
        <footer className="ed-record-modal__footer">
          <div className="ed-record-modal__status">
            {footerNote ?? 'Les changements restent dans le brouillon.'}
          </div>
          <div className="ed-record-modal__actions">
            <button type="button" className="btn" onClick={onClose}>
              Annuler
            </button>
            <button type="button" className="btn primary" onClick={onSave} disabled={saveDisabled}>
              {saveLabel}
            </button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
