'use client';

// Single-select searchable picker (house design — mirrors the editor's ChipMultiSelect
// modal visual language: search field + house-styled option list). Used for long lists
// where a native <select> is unwieldy (sujet, établissement, acteur, référentiel…).
// Popover container (not a nested modal) so it can open inside an already-open modal
// without stacking.
//
// Optional grouping: when any option carries a `group`, the list renders as
// COLLAPSIBLE category sections (headers toggle their options) so a long catalog
// isn't overwhelming. Typing in the search filters across every group at once.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { fold } from './fold';

export interface SearchSelectOption {
  code: string;
  label: string;
  /** Optional category — when any option has one, the list renders as collapsible groups. */
  group?: string;
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.code === value) ?? null;
  // Always render the current value: a code absent from options (stale/legacy) shows itself
  // rather than collapsing to the placeholder (mirrors ReferenceSelect).
  const triggerLabel = selected ? selected.label : value !== '' ? value : placeholder;

  const isGrouped = useMemo(() => options.some((o) => Boolean(o.group)), [options]);
  // Group names in first-appearance order (stable, independent of the filter).
  const groupOrder = useMemo(() => {
    const seen: string[] = [];
    for (const option of options) {
      if (option.group && !seen.includes(option.group)) seen.push(option.group);
    }
    return seen;
  }, [options]);
  // Default open state: the group holding the current value (so the selection is visible).
  const defaultExpanded = useMemo(() => {
    const group = options.find((o) => o.code === value)?.group;
    return group ? { [group]: true } : {};
  }, [options, value]);

  const folded = fold(query.trim());
  const searching = folded !== '';
  const filtered = useMemo(
    () => options.filter((o) => folded === '' || fold(o.label).includes(folded)),
    [options, folded],
  );

  // Grouped sections for render + keyboard. While searching, every group with a match is
  // force-expanded; otherwise a group shows its options only when expanded.
  const sections = useMemo(() => {
    if (!isGrouped) return [];
    return groupOrder.map((name) => {
      const opts = filtered.filter((o) => o.group === name);
      return {
        name,
        opts,
        headerVisible: searching ? opts.length > 0 : true,
        isOpen: searching ? opts.length > 0 : Boolean(expanded[name]),
      };
    });
  }, [isGrouped, groupOrder, filtered, searching, expanded]);

  // The currently navigable options (respecting collapse + filter).
  const flatVisible = isGrouped ? sections.flatMap((s) => (s.isOpen ? s.opts : [])) : filtered;
  const rowIndexByCode = useMemo(() => {
    const map = new Map<string, number>();
    flatVisible.forEach((o, i) => map.set(o.code, allowClear ? i + 1 : i));
    return map;
  }, [flatVisible, allowClear]);
  const rowCount = flatVisible.length + (allowClear ? 1 : 0);
  const showEmpty = isGrouped ? searching && flatVisible.length === 0 : filtered.length === 0;

  // Focus the search on open; reset query + collapse state when it closes.
  useEffect(() => {
    if (open) {
      setActive(0);
      searchRef.current?.focus();
    } else {
      setQuery('');
      setExpanded(defaultExpanded);
    }
  }, [open, defaultExpanded]);

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

  function toggleGroup(name: string) {
    setExpanded((current) => ({ ...current, [name]: !current[name] }));
    setActive(0);
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
      const opt = flatVisible[allowClear ? active - 1 : active];
      if (opt) commit(opt.code);
    }
  }

  function renderOption(option: SearchSelectOption) {
    const rowIndex = rowIndexByCode.get(option.code) ?? -1;
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
            {isGrouped
              ? sections.map((section) =>
                  section.headerVisible ? (
                    <div key={section.name} className="picker__group">
                      <button
                        type="button"
                        className="picker__group-header"
                        aria-expanded={section.isOpen}
                        onClick={() => toggleGroup(section.name)}
                      >
                        <span className={`picker__group-chevron${section.isOpen ? ' is-open' : ''}`} aria-hidden>▸</span>
                        <span className="picker__group-label">{section.name}</span>
                        <span className="picker__group-count" aria-hidden>{section.opts.length}</span>
                      </button>
                      {section.isOpen && section.opts.map(renderOption)}
                    </div>
                  ) : null,
                )
              : filtered.map(renderOption)}
            {showEmpty && <p className="picker__empty">Aucun résultat</p>}
          </div>
        </div>
      )}
    </div>
  );
}
