'use client';

import type { CSSProperties, ReactElement, ReactNode, RefObject } from 'react';
import { FocusScope } from '@radix-ui/react-focus-scope';
import { DismissableLayer } from '@radix-ui/react-dismissable-layer';
import { dialogFocusables } from '../dialog-focus';

/** A non-modal popup participates in the host's existing Radix focus/layer stack. */
export function PopupLayer({ children, panelRef, triggerRef, focusRef, onClose }: {
  children: ReactElement;
  panelRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  focusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  function closeForEscape() {
    onClose();
    triggerRef.current?.focus({ preventScroll: true });
  }

  return <FocusScope asChild
    onMountAutoFocus={(event) => {
      event.preventDefault();
      focusRef.current?.focus({ preventScroll: true });
    }}
    onUnmountAutoFocus={(event) => { event.preventDefault(); }}
  >
    <DismissableLayer asChild onDismiss={onClose} onInteractOutside={(event) => {
      // Ignore a reentrant focus event during the parent/child scope handoff.
      // The trigger also toggles itself; dismissing first would reopen on click.
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) event.preventDefault();
    }} onEscapeKeyDown={(event) => {
      event.preventDefault();
      closeForEscape();
    }} onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeForEscape();
      } else if (event.key === 'Tab') {
        const panel = panelRef.current;
        const trigger = triggerRef.current;
        if (!panel || !trigger) return;
        const inside = dialogFocusables(panel);
        const nextInside = inside.indexOf(document.activeElement as HTMLElement) + (event.shiftKey ? -1 : 1);
        // Let native Tab visit the popup's buttons without the host recovering
        // focus from this portalled DOM subtree.
        event.stopPropagation();
        if (nextInside >= 0 && nextInside < inside.length) return;

        const dialog = trigger.closest<HTMLElement>('[role="dialog"]');
        const outside = dialogFocusables(dialog ?? document.body).filter((node) =>
          !panel.contains(node) && !node.hasAttribute('data-radix-focus-guard'));
        const direction = event.shiftKey ? -1 : 1;
        let index = outside.indexOf(trigger) + direction;
        onClose();
        for (let attempts = 0; attempts < outside.length; attempts++, index += direction) {
          if (dialog) index = (index + outside.length) % outside.length;
          const target = outside[index];
          if (!target) break;
          target.focus();
          if (document.activeElement === target) {
            event.preventDefault();
            return;
          }
        }
        // At the document boundary, keep the browser's ordinary Tab behavior.
        trigger.focus({ preventScroll: true });
      }
    }}>
      {children}
    </DismissableLayer>
  </FocusScope>;
}

export function PickerPanel({ children, panelRef, triggerRef, searchRef, style, onClose }: {
  children: ReactNode;
  panelRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  style: CSSProperties;
  onClose: () => void;
}) {
  return <PopupLayer panelRef={panelRef} triggerRef={triggerRef} focusRef={searchRef} onClose={onClose}>
    <div className="picker__panel" ref={panelRef} style={style}>{children}</div>
  </PopupLayer>;
}
