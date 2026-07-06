"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ── Types ─────────────────────────────────────────────────────────────────

interface FilterDropdownProps<T extends string> {
  options: ReadonlyArray<{ code: T; label: string; group?: string }>;
  selected: T[];
  onChange: (selected: T[]) => void;
  mode: 'multi' | 'single';
  placeholder: string;
  loadError?: string | null;
  /** When provided, adds a "select all / reset" item at the top of the menu.
   *  It shows as active when selected is empty. Clicking it calls onChange([]) and closes. */
  allLabel?: string;
  /** Adds a search input filtering the options + ArrowUp/Down/Enter keyboard nav (impl. 3.2). */
  searchable?: boolean;
  /** Placeholder of the search input (default "Rechercher"). */
  searchPlaceholder?: string;
}

function normalizeNeedle(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
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
  searchable = false,
  searchPlaceholder = 'Rechercher',
}: FilterDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  // SSR guard: createPortal requires document.body, which is unavailable during
  // Next.js pre-rendering. Only enable the portal after the first client mount.
  useEffect(() => { setMounted(true); }, []);

  // Position menu below trigger using fixed coordinates (portal approach).
  // D8 : clampé au viewport — bord gauche/droit ramené dans l'écran, et bascule
  // au-dessus du déclencheur quand la place manque dessous (menu ≤ 260px, cf. CSS).
  const MENU_MAX_HEIGHT = 260;
  const VIEWPORT_MARGIN = 8;
  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuWidth = menuRef.current?.offsetWidth ?? Math.max(180, rect.width);
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      Math.max(VIEWPORT_MARGIN, vw - menuWidth - VIEWPORT_MARGIN),
    );
    const spaceBelow = vh - rect.bottom;
    const openUp = spaceBelow < MENU_MAX_HEIGHT + VIEWPORT_MARGIN && rect.top > spaceBelow;
    setMenuStyle(
      openUp
        ? { position: 'fixed', bottom: vh - rect.top + 4, left, minWidth: rect.width, zIndex: 200 }
        : { position: 'fixed', top: rect.bottom + 4, left, minWidth: rect.width, zIndex: 200 },
    );
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
    // `query` : la recherche change la hauteur/largeur réelle du menu → re-clamp.
  }, [open, query, updateMenuPosition]);

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

  // Reset the search state whenever the menu closes.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlight(-1);
    }
  }, [open]);

  const filteredOptions =
    searchable && query.trim()
      ? options.filter((o) => normalizeNeedle(o.label).includes(normalizeNeedle(query)))
      : options;

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(filteredOptions.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filteredOptions[highlight];
      if (opt) handleItem(opt.code);
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
          {searchable && (
            <li className="filter-dropdown__search-row" role="presentation">
              <input
                className="filter-dropdown__search"
                type="text"
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlight(-1);
                }}
                onKeyDown={handleSearchKey}
                autoFocus
              />
            </li>
          )}
          {allLabel && !query.trim() && (
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
          {filteredOptions.length === 0 && (
            <li className="filter-dropdown__item filter-dropdown__empty" role="presentation">
              Aucune correspondance
            </li>
          )}
          {filteredOptions.map((opt, idx) => {
            const isSelected = selected.includes(opt.code);
            const isHighlighted = idx === highlight;
            // Group header: rendered once before the first (filtered) option of each family.
            // Options are pre-sorted by family, so same-group options are contiguous ⇒ one
            // header per group. No header when options carry no `group` (flat, backward-compat).
            const showGroupHeader = Boolean(opt.group) && opt.group !== filteredOptions[idx - 1]?.group;
            return (
              <Fragment key={opt.code}>
                {showGroupHeader && (
                  <li className="filter-dropdown__group" role="presentation">
                    {opt.group}
                  </li>
                )}
                <li
                  role="option"
                  aria-selected={isSelected}
                  data-code={opt.code}
                  className={[
                    'filter-dropdown__item',
                    isSelected ? 'filter-dropdown__item--selected' : '',
                    isHighlighted ? 'filter-dropdown__item--highlight' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleItem(opt.code)}
                >
                  <span className="filter-dropdown__icon" aria-hidden>
                    {mode === 'multi'
                      ? (isSelected ? '✓' : '')
                      : (isSelected ? '●' : '')}
                  </span>
                  {opt.label}
                </li>
              </Fragment>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}
