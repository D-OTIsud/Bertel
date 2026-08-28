'use client';

// Multi-select searchable picker (16w) — même langage visuel que SearchSelect (déclencheur
// + popover : champ de recherche puis liste d'options), mais à sélection multiple avec des
// puces retirables.
//
// POPOVER, PAS MODALE : c'est la raison d'être de ce composant. `ChipMultiSelect`
// (object-editor/primitives) ouvre une modale — l'utiliser depuis un modal CRM créerait une
// modale DANS une modale. On réutilise ici les classes maison `picker__*` déjà stylées.
//
// Les options sont identifiées par leur `code` (un uuid côté CRM) : deux personnes
// homonymes restent deux entrées distinctes, et rien ne dépend du nom affiché.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { fold } from './fold';
import type { SearchSelectOption } from './SearchSelect';
import { usePickerPopover } from './usePickerPopover';

interface SearchMultiSelectProps {
  /** Codes sélectionnés. L'ordre d'affichage des puces suit celui des options. */
  values: string[];
  options: SearchSelectOption[];
  onChange: (codes: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Message rendu à la place de la liste (chargement, erreur, catalogue vide). */
  emptyLabel?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function SearchMultiSelect({
  values,
  options,
  onChange,
  placeholder = '— Choisir —',
  searchPlaceholder = 'Rechercher…',
  emptyLabel = 'Aucun résultat',
  disabled = false,
  'aria-label': ariaLabel,
}: SearchMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  // Popover PORTALISÉ (voir usePickerPopover). Le ref de mesure est celui du DÉCLENCHEUR,
  // jamais la racine `.picker` : celle-ci englobe aussi la liste de puces, et la mesurer
  // poserait le panneau sous les puces au lieu de sous le bouton.
  const close = useCallback(() => setOpen(false), []);
  const { mounted, triggerRef, panelRef, panelStyle } = usePickerPopover(open, close, query);

  const selectedSet = useMemo(() => new Set(values), [values]);
  // Les puces suivent l'ordre des OPTIONS (stable, tri serveur), pas l'ordre de clic.
  // Un code sans option correspondante (catalogue pas encore chargé) reste néanmoins
  // sélectionné : c'est ce qui garantit qu'aucune sélection n'est perdue quand la liste
  // des assignables arrive APRÈS l'ouverture du modal.
  const selectedOptions = useMemo(() => {
    const known = options.filter((option) => selectedSet.has(option.code));
    const knownCodes = new Set(known.map((option) => option.code));
    const unknown = values.filter((code) => !knownCodes.has(code));
    return [...known, ...unknown.map((code) => ({ code, label: code }))];
  }, [options, values, selectedSet]);

  const folded = fold(query.trim());
  const filtered = useMemo(
    () => options.filter((option) => folded === '' || fold(option.label).includes(folded)),
    [options, folded],
  );

  useEffect(() => {
    if (open) {
      setActive(0);
      searchRef.current?.focus();
    } else {
      setQuery('');
    }
  }, [open]);

  // Le popover reste OUVERT après un basculement : on en choisit plusieurs d'affilée.
  function toggle(code: string) {
    onChange(selectedSet.has(code) ? values.filter((value) => value !== code) : [...values, code]);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      // Ne ferme QUE ce popover — un modal hôte se fermerait aussi sur un Escape qui remonte.
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[active];
      if (option) toggle(option.code);
    }
  }

  const triggerLabel =
    selectedOptions.length === 0
      ? placeholder
      : selectedOptions.length === 1
        ? selectedOptions[0].label
        : `${selectedOptions.length} personnes`;

  return (
    <div className="picker picker--multi">
      <button
        ref={triggerRef}
        type="button"
        className={`picker__trigger${selectedOptions.length ? '' : ' is-empty'}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="picker__trigger-label">{triggerLabel}</span>
        <span className="picker__chevron" aria-hidden>▾</span>
      </button>

      {selectedOptions.length > 0 && (
        <ul className="picker__chips">
          {selectedOptions.map((option) => (
            <li key={option.code} className="picker__chip">
              <span className="picker__chip-label">{option.label}</span>
              <button
                type="button"
                className="picker__chip-remove"
                aria-label={`Retirer ${option.label}`}
                disabled={disabled}
                onClick={() => toggle(option.code)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {mounted && open && createPortal(
        <div className="picker__panel" ref={panelRef} style={panelStyle}>
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
          <div className="picker__options" role="listbox" aria-multiselectable id={listId}>
            {filtered.map((option, index) => {
              const checked = selectedSet.has(option.code);
              return (
                <button
                  key={option.code}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  className={`picker__option${index === active ? ' is-active' : ''}${checked ? ' is-on' : ''}`}
                  onClick={() => toggle(option.code)}
                >
                  <span className="picker__option-check" aria-hidden>{checked ? '✓' : ''}</span>
                  {option.label}
                </button>
              );
            })}
            {filtered.length === 0 && <p className="picker__empty">{emptyLabel}</p>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
