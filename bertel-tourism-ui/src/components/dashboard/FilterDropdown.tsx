"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ── Types ─────────────────────────────────────────────────────────────────

interface FilterDropdownProps<T extends string> {
  options: ReadonlyArray<{ code: T; label: string }>;
  selected: T[];
  onChange: (selected: T[]) => void;
  mode: 'multi' | 'single';
  placeholder: string;
  loadError?: string | null;
  /** When provided, adds a "select all / reset" item at the top of the menu.
   *  It shows as active when selected is empty. Clicking it calls onChange([]) and closes. */
  allLabel?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getTriggerLabel<T extends string>(
  options: ReadonlyArray<{ code: T; label: string }>,
  selected: T[],
  placeholder: string,
): string {
  if (selected.length === 0) return placeholder;
  if (selected.length === 1) {
    return options.find((o) => o.code === selected[0])?.label ?? placeholder;
  }
  return `${selected.length} sélectionnés`;
}

// ── Component ─────────────────────────────────────────────────────────────

export function FilterDropdown<T extends string>({
  options,
  selected,
  onChange,
  mode,
  placeholder,
  loadError,
  allLabel,
}: FilterDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  // SSR guard: createPortal requires document.body, which is unavailable during
  // Next.js pre-rendering. Only enable the portal after the first client mount.
  useEffect(() => { setMounted(true); }, []);

  // Position menu below trigger using fixed coordinates (portal approach).
  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      minWidth: rect.width,
      zIndex: 200,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);
    return () => {
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [open, updateMenuPosition]);

  // Close on click-outside.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  function handleTrigger() {
    setOpen((v) => !v);
  }

  function handleItem(code: T) {
    if (mode === 'single') {
      const next = selected.includes(code) ? [] : [code];
      onChange(next as T[]);
      setOpen(false);
    } else {
      const next = selected.includes(code)
        ? selected.filter((v) => v !== code)
        : [...selected, code];
      onChange(next);
      // multi: stay open
    }
  }

  const label = getTriggerLabel(options, selected, placeholder);
  const hasSelection = selected.length > 0;

  return (
    <div className="filter-dropdown">
      <button
        ref={triggerRef}
        type="button"
        className={hasSelection
          ? 'filter-dropdown__trigger filter-dropdown__trigger--active'
          : 'filter-dropdown__trigger'}
        onClick={handleTrigger}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="filter-dropdown__label">{label}</span>
        <span className="filter-dropdown__chevron" aria-hidden>▾</span>
      </button>

      {loadError && (
        <p className="filter-dropdown__error">{loadError}</p>
      )}

      {mounted && open && createPortal(
        <ul
          ref={menuRef}
          role="listbox"
          className="filter-dropdown__menu"
          style={menuStyle}
        >
          {allLabel && (
            <li
              role="option"
              aria-selected={selected.length === 0}
              className={selected.length === 0
                ? 'filter-dropdown__item filter-dropdown__item--selected'
                : 'filter-dropdown__item'}
              onClick={() => { onChange([]); setOpen(false); }}
            >
              <span className="filter-dropdown__icon" aria-hidden>
                {selected.length === 0 ? '✓' : ''}
              </span>
              {allLabel}
            </li>
          )}
          {options.map((opt) => {
            const isSelected = selected.includes(opt.code);
            return (
              <li
                key={opt.code}
                role="option"
                aria-selected={isSelected}
                data-code={opt.code}
                className={isSelected
                  ? 'filter-dropdown__item filter-dropdown__item--selected'
                  : 'filter-dropdown__item'}
                onClick={() => handleItem(opt.code)}
              >
                <span className="filter-dropdown__icon" aria-hidden>
                  {mode === 'multi'
                    ? (isSelected ? '✓' : '')
                    : (isSelected ? '●' : '')}
                </span>
                {opt.label}
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}
