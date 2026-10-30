'use client';

import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { usePresence } from '../../hooks/usePresence';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogPortal,
  DialogPrimitiveContent,
  DialogPrimitiveOverlay,
  DialogPrimitiveTitle,
} from '../ui/dialog';
import { focusDialogControl, restoreDialogOpener } from '../ui/dialog-focus';

// Match the existing card transitions. The shared dialog stays mounted until they finish.
const MODAL_EXIT_MS_BY_VARIANT: Record<'modal' | 'drawer', number> = { modal: 220, drawer: 280 };

export function Modal({
  open,
  title,
  onOpenChange,
  children,
  footer,
  variant = 'modal',
  size = 'default',
  className,
}: {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'modal' | 'drawer';
  /** The wide selector remains 720px; the default centered card remains 520px. */
  size?: 'default' | 'wide';
  className?: string;
}) {
  const { shouldRender, phase } = usePresence(open, MODAL_EXIT_MS_BY_VARIANT[variant]);
  const cardRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  if (!shouldRender || typeof document === 'undefined') return null;

  return (
    <Dialog open={shouldRender} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogPrimitiveOverlay asChild>
          <div
            className={variant === 'drawer' ? 'app-modal-overlay app-modal-overlay--drawer' : 'app-modal-overlay'}
            data-motion-phase={phase}
            onMouseDown={(event) => { if (event.target === event.currentTarget) onOpenChange(false); }}
          >
            <DialogPrimitiveContent asChild ref={cardRef} aria-modal="true" aria-describedby={undefined}
              onPointerDownOutside={(event) => event.preventDefault()}
              onOpenAutoFocus={(event) => {
                openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                focusDialogControl(event, cardRef.current, 'app-modal__close');
              }}
              onCloseAutoFocus={(event) => restoreDialogOpener(event, openerRef.current)}>
              <div className={cn(
                variant === 'drawer' ? 'app-modal app-modal--drawer' : 'app-modal',
                size === 'wide' && 'app-modal--wide',
                className,
              )} data-motion-phase={phase} aria-label={title}>
                <div className="app-modal__head">
                  <DialogPrimitiveTitle asChild><h3>{title}</h3></DialogPrimitiveTitle>
                  <button type="button" className="app-modal__close" aria-label="Fermer" onClick={() => onOpenChange(false)}>
                    <X size={14} aria-hidden />
                  </button>
                </div>
                <div className="app-modal__body">{children}</div>
                {footer && <div className="app-modal__foot">{footer}</div>}
              </div>
            </DialogPrimitiveContent>
          </div>
        </DialogPrimitiveOverlay>
      </DialogPortal>
    </Dialog>
  );
}
