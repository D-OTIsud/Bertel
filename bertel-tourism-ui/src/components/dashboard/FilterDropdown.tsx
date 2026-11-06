"use client";

import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { PopupLayer, scrollOptionIntoView } from '../ui/pickers/PickerPanel';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({ position: 'fixed', top: 0, left: 0, opacity: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const menuId = `filter-options-${id}`;
  const triggerId = `filter-trigger-${id}`;

  function closeAndRestoreFocus() {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

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
        ? { position: 'fixed', bottom: vh - rect.top + 4, left, minWidth: rect.width, zIndex: 200, opacity: 1 }
        : { position: 'fixed', top: rect.bottom + 4, left, minWidth: rect.width, zIndex: 200, opacity: 1 },
    );
  }, []);

  useClientLayoutEffect(() => {
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

  function handleTrigger() {
    triggerRef.current?.focus({ preventScroll: true });
    if (!open) setHighlight(searchable ? -1 : 0);
    setOpen((v) => !v);
  }

  function handleItem(code: T) {
    if (mode === 'single') {
      const next = selected.includes(code) ? [] : [code];
      onChange(next as T[]);
      closeAndRestoreFocus();
    } else {
      const next = selected.includes(code)
        ? selected.filter((v) => v !== code)
        : [...selected, code];
      onChange(next);
      // multi: stay open
      (searchable ? searchRef.current : menuRef.current)?.focus({ preventScroll: true });
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

  const showAll = Boolean(allLabel) && !query.trim();
  const optionOffset = showAll ? 1 : 0;
  const rowCount = filteredOptions.length + optionOffset;
  const optionId = (code: string) => `${menuId}-option-${encodeURIComponent(code)}`;
  const activeOption = filteredOptions[highlight - optionOffset];
  const activeId = showAll && highlight === 0 ? `${menuId}-all` : activeOption ? optionId(activeOption.code) : undefined;

  useEffect(() => { setHighlight((index) => Math.max(-1, Math.min(index, rowCount - 1))); }, [rowCount]);

  useEffect(() => {
    if (open && activeId) scrollOptionIntoView(document.getElementById(activeId), menuRef.current,
      searchable ? menuRef.current?.querySelector<HTMLElement>('.filter-dropdown__search-row') : null);
  }, [open, activeId, searchable]);

  function activateHighlighted() {
    if (highlight < 0 || highlight >= rowCount) return;
    if (showAll && highlight === 0) {
      onChange([]);
      closeAndRestoreFocus();
      return;
    }
    const option = filteredOptions[highlight - optionOffset];
    if (option) handleItem(option.code);
  }

  function handleMenuKey(e: React.KeyboardEvent<HTMLElement>) {
    const inSearch = e.target instanceof HTMLInputElement;
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      closeAndRestoreFocus();
    } else if (e.key === 'ArrowDown') {
      e.stopPropagation();
      e.preventDefault();
      setHighlight((h) => Math.min(rowCount - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.stopPropagation();
      e.preventDefault();
      setHighlight((h) => rowCount ? Math.max(0, h - 1) : -1);
    } else if (!inSearch && (e.key === 'Home' || e.key === 'End')) {
      e.stopPropagation();
      e.preventDefault();
      setHighlight(rowCount ? (e.key === 'Home' ? 0 : rowCount - 1) : -1);
    } else if (e.key === 'Enter' || (!inSearch && e.key === ' ')) {
      e.stopPropagation();
      e.preventDefault();
      activateHighlighted();
    }
  }

  const label = getTriggerLabel(options, selected, placeholder);
  const hasSelection = selected.length > 0;

  return (
    <div className="filter-dropdown">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={hasSelection
          ? 'filter-dropdown__trigger filter-dropdown__trigger--active'
          : 'filter-dropdown__trigger'}
        onClick={handleTrigger}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            event.stopPropagation();
            triggerRef.current?.focus({ preventScroll: true });
            setHighlight(event.key === 'ArrowUp' ? options.length + (allLabel ? 1 : 0) - 1 : 0);
            setOpen(true);
          } else if (open) handleMenuKey(event);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? menuId : undefined}
      >
        <span className="filter-dropdown__label">{label}</span>
        <ChevronDown className="filter-dropdown__chevron" size={20} strokeWidth={2} aria-hidden="true" />
      </button>

      {loadError && (
        <p className="filter-dropdown__error">{loadError}</p>
      )}

      {mounted && open && createPortal(
        <PopupLayer panelRef={menuRef} triggerRef={triggerRef} focusRef={searchable ? searchRef : menuRef} onClose={() => setOpen(false)}>
        <ul
          ref={menuRef}
          id={menuId}
          role="listbox"
          aria-labelledby={triggerId}
          aria-multiselectable={mode === 'multi' ? true : undefined}
          aria-activedescendant={!searchable ? activeId : undefined}
          tabIndex={searchable ? undefined : -1}
          onKeyDown={handleMenuKey}
          className="filter-dropdown__menu"
          style={menuStyle}
        >
          {searchable && (
            <li className="filter-dropdown__search-row" role="presentation">
              <input
                ref={searchRef}
                className="filter-dropdown__search"
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-autocomplete="list"
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={menuId}
                aria-activedescendant={activeId}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlight(-1);
                }}
              />
            </li>
          )}
          {showAll && (
            <li
              id={`${menuId}-all`}
              role="option"
              aria-selected={selected.length === 0}
              className={['filter-dropdown__item', selected.length === 0 ? 'filter-dropdown__item--selected' : '', highlight === 0 ? 'filter-dropdown__item--highlight' : ''].filter(Boolean).join(' ')}
              onClick={() => { onChange([]); closeAndRestoreFocus(); }}
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
            const isHighlighted = idx + optionOffset === highlight;
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
                  id={optionId(opt.code)}
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
        </ul>
        </PopupLayer>,
        document.body,
      )}
    </div>
  );
}
