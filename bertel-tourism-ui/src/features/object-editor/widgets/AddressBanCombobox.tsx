'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { normalizeLocationReferenceText } from '../../../lib/location-normalization';
import { searchAddresses, type GeocodeHit } from './geocode-address';

export interface AddressBanComboboxProps {
  value: string;
  /** Manual typing path — committed (title-cased) on blur, like the old formatted input. */
  onChange: (next: string) => void;
  /** A BAN suggestion was picked — the caller fills address+commune+GPS in one shot. */
  onSelect: (hit: GeocodeHit) => void;
  placeholder?: string;
  'aria-label'?: string;
}

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

/**
 * Adresse field with BAN autocomplete (api-adresse.data.gouv.fr) — typing shows
 * standardized national-address suggestions; picking one standardizes the whole
 * address block. Free text stays possible (committed with title-case on blur),
 * so unknown/private-road addresses are never blocked.
 */
export function AddressBanCombobox({
  value,
  onChange,
  onSelect,
  placeholder,
  'aria-label': ariaLabel,
}: AddressBanComboboxProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const [draft, setDraft] = useState(value);
  const [suggestions, setSuggestions] = useState<GeocodeHit[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Cancel the pending debounce on unmount (avoids a post-unmount fetch/setState).
  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  }, []);

  function scheduleSearch(query: string) {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      const seq = ++requestSeqRef.current;
      searchAddresses(query)
        .then((hits) => {
          if (seq !== requestSeqRef.current) {
            return; // a newer keystroke superseded this request
          }
          setSuggestions(hits);
          setOpen(hits.length > 0);
          setActiveIndex(-1);
        })
        .catch(() => {
          // BAN unreachable — silently degrade to free text (the field still works).
          if (seq === requestSeqRef.current) {
            setSuggestions([]);
            setOpen(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
  }

  function commitDraft() {
    const normalized = normalizeLocationReferenceText(draft);
    setDraft(normalized);
    setOpen(false);
    setActiveIndex(-1);
    if (normalized !== value) {
      onChange(normalized);
    }
  }

  function pick(hit: GeocodeHit) {
    requestSeqRef.current += 1; // drop any in-flight search
    setDraft(hit.name);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    onSelect(hit);
  }

  function handleBlur(event: React.FocusEvent) {
    const related = event.relatedTarget as Node | null;
    if (related && rootRef.current?.contains(related)) {
      return;
    }
    commitDraft();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
      return;
    }
    if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (open && activeIndex >= 0 && suggestions[activeIndex]) {
        pick(suggestions[activeIndex]);
        return;
      }
      commitDraft();
    }
  }

  return (
    <div ref={rootRef} className="location-combobox">
      <input
        type="text"
        className="input"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => {
          setDraft(event.target.value);
          scheduleSearch(event.target.value);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {open && suggestions.length > 0 ? (
        <ul id={listId} role="listbox" className="location-combobox__menu">
          {suggestions.map((hit, index) => (
            <li
              key={`${hit.label}-${hit.citycode}`}
              role="option"
              aria-selected={index === activeIndex}
              className={
                index === activeIndex
                  ? 'location-combobox__item location-combobox__item--active'
                  : 'location-combobox__item'
              }
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(hit)}
            >
              {hit.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
