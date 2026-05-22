'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { normalizeLocationReferenceText } from '../../../lib/location-normalization';
import {
  canCreateLocationReferenceValue,
  filterLocationReferenceOptions,
  locationReferenceValueExists,
  resolveLocationReferenceCreateValue,
} from './location-reference-combobox-utils';

export interface LocationReferenceComboboxProps {
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
  placeholder?: string;
  'aria-label'?: string;
}

/**
 * Typeahead combobox for corpus location references (lieu-dit, etc.).
 * Pick an existing value or commit a new one — always normalized on selection/blur.
 */
export function LocationReferenceCombobox({
  value,
  options,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
}: LocationReferenceComboboxProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = useMemo(
    () => filterLocationReferenceOptions(options, query),
    [options, query],
  );

  const createValue = useMemo(
    () => (canCreateLocationReferenceValue(options, query) ? resolveLocationReferenceCreateValue(query) : null),
    [options, query],
  );

  const menuItems = useMemo(() => {
    const items: { kind: 'option' | 'create'; label: string; value: string }[] = filtered.map((option) => ({
      kind: 'option' as const,
      label: option,
      value: option,
    }));
    if (createValue) {
      items.push({
        kind: 'create',
        label: `Ajouter « ${createValue} »`,
        value: createValue,
      });
    }
    return items;
  }, [createValue, filtered]);

  function commit(next: string) {
    const normalized = normalizeLocationReferenceText(next);
    setQuery(normalized);
    setOpen(false);
    setActiveIndex(-1);
    if (normalized !== value) {
      onChange(normalized);
    }
  }

  function commitQuery() {
    const normalized = resolveLocationReferenceCreateValue(query);
    if (!normalized) {
      setQuery(value);
      setOpen(false);
      return;
    }
    if (locationReferenceValueExists(options, normalized)) {
      commit(normalized);
      return;
    }
    commit(normalized);
  }

  function handleBlur(event: React.FocusEvent) {
    const related = event.relatedTarget as Node | null;
    if (related && rootRef.current?.contains(related)) {
      return;
    }
    commitQuery();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, menuItems.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      setQuery(value);
      setActiveIndex(-1);
      return;
    }
    if (event.key === 'Enter' && open && activeIndex >= 0 && menuItems[activeIndex]) {
      event.preventDefault();
      commit(menuItems[activeIndex].value);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commitQuery();
    }
  }

  return (
    <div ref={rootRef} className="location-combobox">
      <input
        type="text"
        className="input"
        role="combobox"
        aria-expanded={open && menuItems.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {open && menuItems.length > 0 ? (
        <ul id={listId} role="listbox" className="location-combobox__menu">
          {menuItems.map((item, index) => (
            <li
              key={`${item.kind}-${item.value}`}
              role="option"
              aria-selected={index === activeIndex}
              className={
                index === activeIndex
                  ? 'location-combobox__item location-combobox__item--active'
                  : item.kind === 'create'
                    ? 'location-combobox__item location-combobox__item--create'
                    : 'location-combobox__item'
              }
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(item.value)}
            >
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
