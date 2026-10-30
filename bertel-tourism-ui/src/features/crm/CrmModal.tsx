'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogPrimitiveContent,
  DialogPrimitiveOverlay,
  DialogPrimitiveTitle,
} from '../../components/ui/dialog';
import { focusDialogControl, restoreDialogOpener } from '../../components/ui/dialog-focus';

/** Keeps its CRM ancestry and tokens while sharing the application's dialog engine. */
export function CrmModal({
  title,
  onClose,
  children,
  footer,
  variant = 'modal',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'modal' | 'drawer';
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  // Inline dialogs register after an enclosing portaled Sheet, so the child owns focus and dismissal.
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  // No portal: .crm-app supplies scoped colors, typography and form styles.
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitiveOverlay asChild>
        <div className={variant === 'drawer' ? 'crm-modal-overlay crm-modal-overlay--drawer' : 'crm-modal-overlay'}
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
          <DialogPrimitiveContent asChild ref={cardRef} aria-modal="true" aria-describedby={undefined}
            onPointerDownOutside={(event) => event.preventDefault()}
            onOpenAutoFocus={(event) => {
              openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              focusDialogControl(event, cardRef.current, 'crm-modal__close');
            }}
            onCloseAutoFocus={(event) => restoreDialogOpener(event, openerRef.current)}>
            <div className={variant === 'drawer' ? 'crm-modal crm-modal--drawer' : 'crm-modal'} aria-label={title}>
              <div className="crm-modal__head">
                <DialogPrimitiveTitle asChild><h3>{title}</h3></DialogPrimitiveTitle>
                <button type="button" className="crm-modal__close" aria-label="Fermer" onClick={onClose}>
                  <X size={14} aria-hidden />
                </button>
              </div>
              <div className="crm-modal__body">{children}</div>
              {footer && <div className="crm-modal__foot">{footer}</div>}
            </div>
          </DialogPrimitiveContent>
        </div>
      </DialogPrimitiveOverlay>
    </Dialog>
  );
}
