'use client';

// Single-select searchable picker (house design — mirrors the editor's ChipMultiSelect
// modal visual language: search field + house-styled option list). Used for long lists
// where a native <select> is unwieldy (sujet, établissement, acteur…). Popover container
// (not a nested modal) so it can open inside an already-open modal without stacking.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { fold } from './fold';

export interface SearchSelectOption {
  code: string;
  label: string;
}

interface SearchSelectProps {
  value: string;
  options: SearchSelectOption[];
  onChange: (code: string) => void;
  /** Trigger text when nothing is selected. */
  placeholder?: string;
  searchPlaceholder?: string;
  /** Adds a leading « clear » row that emits the empty code (for optional fields). */
  allowClear?: boolean;
  clearLabel?: string;
  'aria-label'?: string;
}

export function SearchSelect({
  value,
  options,
  onChange,
  placeholder = '— Choisir —',
  searchPlaceholder = 'Rechercher…',
  allowClear = false,
  clearLabel = '— Aucun —',
  'aria-label': ariaLabel,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.code === value) ?? null;
  // Always render the current value: a code absent from options (stale/legacy) shows itself
  // rather than collapsing to the placeholder (mirrors ReferenceSelect).
  const triggerLabel = selected ? selected.label : value !== '' ? value : placeholder;

  const folded = fold(query.trim());
  const filtered = useMemo(
    () => options.filter((o) => folded === '' || fold(o.label).includes(folded)),
    [options, folded],
  );
  const rowCount = filtered.length + (allowClear ? 1 : 0);

  // Focus the search on open; reset the query when it closes.
  useEffect(() => {
    if (open) {
      setActive(0);
      searchRef.current?.focus();
    } else {
      setQuery('');
    }
  }, [open]);

  // Outside mousedown closes the popover.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  function commit(code: string) {
    onChange(code);
    setOpen(false);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      // Close THIS popover only — a host modal (CrmModal) also closes on a bubbling Escape.
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((a) => Math.min(a + 1, rowCount - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (allowClear && active === 0) {
        commit('');
        return;
      }
      const opt = filtered[allowClear ? active - 1 : active];
      if (opt) commit(opt.code);
    }
  }

  return (
    <div className="picker picker--single" ref={rootRef}>
      <button
        type="button"
        className={`picker__trigger${selected ? '' : ' is-empty'}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="picker__trigger-label">{triggerLabel}</span>
        <span className="picker__chevron" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="picker__panel">
          <input
            ref={searchRef}
            className="picker__search"
            type="text"
            value={query}
            placeholder={searchPlaceholder}
            aria-label="Rechercher"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onSearchKeyDown}
          />
          <div className="picker__options" role="listbox" id={listId}>
            {allowClear && (
              <button
                type="button"
                role="option"
                aria-selected={value === ''}
                className={`picker__option${active === 0 ? ' is-active' : ''}${value === '' ? ' is-on' : ''}`}
                onClick={() => commit('')}
              >
                {clearLabel}
              </button>
            )}
            {filtered.map((option, i) => {
              const rowIndex = allowClear ? i + 1 : i;
              return (
                <button
                  key={option.code}
                  type="button"
                  role="option"
                  aria-selected={option.code === value}
                  className={`picker__option${rowIndex === active ? ' is-active' : ''}${option.code === value ? ' is-on' : ''}`}
                  onClick={() => commit(option.code)}
                >
                  {option.label}
                </button>
              );
            })}
            {filtered.length === 0 && <p className="picker__empty">Aucun résultat</p>}
          </div>
        </div>
      )}
    </div>
  );
}
