import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Same viewport-aware portal pattern as the taxonomy chooser's information buttons. */
export function FieldHelp({ label, hint, hintId }: { label: string; hint: string; hintId: string }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  function cancelLeave() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  }
  function show() { cancelLeave(); setOpen(true); }
  function leave() {
    cancelLeave();
    leaveTimer.current = setTimeout(() => {
      if (document.activeElement !== anchor.current) setOpen(false);
    }, 150);
  }
  useEffect(() => () => cancelLeave(), []);

  useLayoutEffect(() => {
    if (!open) { setPosition(null); return; }
    function update() {
      if (!anchor.current || !bubble.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const bounds = bubble.current.getBoundingClientRect();
      const margin = 12;
      const left = Math.min(Math.max(rect.left + (rect.width - bounds.width) / 2, margin), Math.max(margin, window.innerWidth - bounds.width - margin));
      const below = rect.bottom + 8;
      const top = below + bounds.height <= window.innerHeight - margin ? below : Math.max(margin, rect.top - 8 - bounds.height);
      setPosition({ left, top });
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open, hint]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!anchor.current?.contains(event.target as Node) && !bubble.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        anchor.current?.focus();
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [open]);

  return <>
    <button
      ref={anchor}
      type="button"
      aria-label={`Aide : ${label}`}
      aria-describedby={hintId}
      aria-expanded={open}
      onFocus={show}
      onBlur={() => setOpen(false)}
      onMouseEnter={show}
      onMouseLeave={leave}
      onClick={show}
      className="grid h-6 w-6 flex-none place-items-center rounded-full border-0 bg-transparent p-0 text-[9px] font-bold text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30"
    ><span className="grid h-4 w-4 place-items-center rounded-full bg-surface2" aria-hidden="true">?</span></button>
    {open && createPortal(
      <div ref={bubble} aria-hidden="true" data-field-help={hintId}
        onMouseEnter={show} onMouseLeave={leave}
        className="fixed z-[1000] w-72 max-w-[calc(100vw-24px)] rounded-lg bg-ink px-3 py-2.5 text-left text-sm font-normal leading-snug text-white shadow-xl"
        style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}>
        {hint}
      </div>, document.body,
    )}
  </>;
}
