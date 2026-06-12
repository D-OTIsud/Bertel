"use client";

// Modal accessible du module CRM (§61 rectifs PO point 3) — primitive de présentation
// pure : overlay + carte surface (shadow-m, max-width 560px), role="dialog" +
// aria-modal, fermeture Escape / clic overlay / bouton ✕, focus initial sur le premier
// champ et focus-trap Tab léger. Les formulaires sont passés en children par les vues ;
// le gating write (boutons d'ouverture désactivés avec raison) appartient aux vues.

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

export function CrmModal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus initial : premier champ du formulaire (à défaut, le bouton ✕).
    const card = cardRef.current;
    if (!card) return;
    const focusables = [...card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
    (focusables.find((el) => !el.classList.contains('crm-modal__close')) ?? focusables[0])?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    // Trap léger : Tab boucle à l'intérieur du dialogue.
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
      className="crm-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={cardRef} className="crm-modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={handleKeyDown}>
        <div className="crm-modal__head">
          <h3>{title}</h3>
          <button type="button" className="crm-modal__close" aria-label="Fermer" onClick={onClose}>
            <X size={14} aria-hidden />
          </button>
        </div>
        <div className="crm-modal__body">{children}</div>
        {footer && <div className="crm-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
