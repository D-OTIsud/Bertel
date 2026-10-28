'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Info } from 'lucide-react';

interface ExplorerFilterPopoverProps {
  label: string;
  children: ReactNode;
  actions?: boolean;
}

/** Small disclosures outside the clipped Explorer layout, with a natural tab order. */
export function ExplorerFilterPopover({ label, children, actions = false }: ExplorerFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const anchor = trigger.getBoundingClientRect();
      const bounds = panel.getBoundingClientRect();
      setPosition({
        visibility: 'visible',
        left: Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8)),
        top: Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - bounds.height - 8)),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open && position.visibility === 'visible') {
      (panelRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? panelRef.current)?.focus();
    }
  }, [open, position.visibility]);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: Event) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
    };
  }, [open]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return <>
    <button
      ref={triggerRef}
      type="button"
      className={`ghost-button active-filter-strip__reset explorer-active-filters__popover-trigger${actions ? '' : ' explorer-active-filters__info'}`}
      aria-label={label}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      onClick={() => setOpen(!open)}
    >
      {actions ? <>Actions <ChevronDown size={14} aria-hidden="true" /></> : <Info size={16} aria-hidden="true" />}
    </button>
    {open && createPortal(
      <div
        id={panelId}
        ref={panelRef}
        role="group"
        aria-label={label}
        tabIndex={-1}
        className={`explorer-filter-popover${actions ? ' explorer-filter-popover--actions' : ''}`}
        style={position}
        onClick={(event) => {
          if (actions && (event.target as Element).closest('button')) closeAndFocusTrigger();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeAndFocusTrigger();
          } else if (event.key === 'Tab') {
            const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
            const atBoundary = !buttons?.length || (event.shiftKey
              ? document.activeElement === buttons[0]
              : document.activeElement === buttons[buttons.length - 1]);
            if (atBoundary) {
              closeAndFocusTrigger();
              if (event.shiftKey) event.preventDefault();
            }
          }
        }}
      >
        {children}
      </div>,
      document.body,
    )}
  </>;
}
