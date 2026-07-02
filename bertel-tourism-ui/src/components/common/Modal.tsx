'use client';

// Modal accessible MAISON (vocabulaire de l'app, pas shadcn) — overlay + carte surface,
// role="dialog" + aria-modal, fermeture Escape / clic overlay / bouton ✕, focus initial sur
// le premier champ + focus-trap Tab léger. `variant="drawer"` = tiroir latéral droit pleine
// hauteur (footer collant). Même mécanique que CrmModal mais générique (settings/team), pour
// remplacer les primitives shadcn Dialog/Sheet (unification S3, un seul design system).
// D1 (revue UX) : scroll-lock du body + restauration du focus au déclencheur à la fermeture +
// focusables robustes (tabindex/summary/contenteditable, re-capture du focus échappé).

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
  ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), details > summary,' +
  ' [contenteditable]:not([contenteditable="false"])';

function getFocusables(root: HTMLElement): HTMLElement[] {
  const all = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (el) => !el.hasAttribute('aria-hidden'),
  );
  // offsetParent === null ⇒ élément masqué (display:none…). jsdom renvoie null
  // partout : repli sur la liste complète pour rester testable.
  const visible = all.filter((el) => el.offsetParent !== null);
  return visible.length > 0 ? visible : all;
}

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
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // D1 : mémorise le déclencheur + verrouille le scroll du body (sauve/restaure ⇒
    // les modales empilées se déverrouillent dans le bon ordre).
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const card = cardRef.current;
    if (card) {
      const focusables = getFocusables(card);
      (focusables.find((el) => !el.classList.contains('app-modal__close')) ?? focusables[0])?.focus();
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      returnFocusRef.current?.focus();
    };
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
    const focusables = getFocusables(card);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    // `!card.contains(active)` : un focus échappé de la carte est ramené dans la boucle.
    if (event.shiftKey && (active === first || !card.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !card.contains(active))) {
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
