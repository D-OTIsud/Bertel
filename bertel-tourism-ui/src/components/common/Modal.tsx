'use client';

// Modal accessible MAISON (vocabulaire de l'app, pas shadcn) — overlay + carte surface,
// role="dialog" + aria-modal, fermeture Escape / clic overlay / bouton ✕, focus initial sur
// le premier champ + focus-trap Tab léger. `variant="drawer"` = tiroir latéral droit pleine
// hauteur (footer collant). Même mécanique que CrmModal mais générique (settings/team), pour
// remplacer les primitives shadcn Dialog/Sheet (unification S3, un seul design system).

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

export function Modal({
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

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const focusables = [...card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
    (focusables.find((el) => !el.classList.contains('app-modal__close')) ?? focusables[0])?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const card = cardRef.current;
    if (!card) return;
    const focusables = [...card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className={variant === 'drawer' ? 'app-modal-overlay app-modal-overlay--drawer' : 'app-modal-overlay'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        className={variant === 'drawer' ? 'app-modal app-modal--drawer' : 'app-modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={handleKeyDown}
      >
        <div className="app-modal__head">
          <h3>{title}</h3>
          <button type="button" className="app-modal__close" aria-label="Fermer" onClick={onClose}>
            <X size={14} aria-hidden />
          </button>
        </div>
        <div className="app-modal__body">{children}</div>
        {footer && <div className="app-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
