import { useState } from 'react';
import { Chip, ChipSet } from './index';
import { EditorModal } from './EditorModal';
import { Input } from './Input';
import { fold } from '../../../components/ui/pickers/fold';

interface ChipMultiSelectOption {
  code: string;
  label: string;
}

interface ChipMultiSelectProps {
  options: ChipMultiSelectOption[];
  selected: string[];
  /** Inline mode (default): single-code toggle. */
  onToggle?: (code: string) => void;
  /** Modal mode (required when `modalTitle` is set): replaces the whole selection at once
   *  (staged Valider — avoids the stale-closure bug of looping onToggle). */
  onChange?: (next: string[]) => void;
  sm?: boolean;
  /** When set, renders a modal picker (selected chips + « Choisir… » trigger) instead of the
   *  full inline chip list. Use for large lists (>~12 options). Requires `onChange`. */
  modalTitle?: string;
  searchPlaceholder?: string;
  /** Optional native tooltip for the modal-mode trigger chips. Returns the title for a
   *  selected code (e.g. a language level); falls back to "Retirer" when undefined.
   *  No effect in inline mode. */
  chipTitle?: (code: string) => string | undefined;
}

/** Chip-toggle multiselect over a flat option list. Inline by default; a modal picker
 *  (search + Sélectionnés/Disponibles) when `modalTitle` is set, for long catalogs. */
export function ChipMultiSelect({
  options,
  selected,
  onToggle,
  onChange,
  sm,
  modalTitle,
  searchPlaceholder,
  chipTitle,
}: ChipMultiSelectProps) {
  if (!modalTitle) {
    return (
      <ChipSet>
        {options.map((option) => (
          <Chip
            key={option.code}
            label={option.label}
            on={selected.includes(option.code)}
            onClick={() => onToggle?.(option.code)}
            sm={sm}
          />
        ))}
      </ChipSet>
    );
  }
  return (
    <ChipMultiSelectModal
      options={options}
      selected={selected}
      onChange={onChange ?? (() => undefined)}
      title={modalTitle}
      searchPlaceholder={searchPlaceholder}
      sm={sm}
      chipTitle={chipTitle}
    />
  );
}

function ChipMultiSelectModal({
  options,
  selected,
  onChange,
  title,
  searchPlaceholder,
  sm,
  chipTitle,
}: {
  options: ChipMultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  title: string;
  searchPlaceholder?: string;
  sm?: boolean;
  chipTitle?: (code: string) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<string[]>(selected);

  const byCode = new Map(options.map((option) => [option.code, option]));
  const selectedOptions = selected.map((code) => byCode.get(code)).filter(Boolean) as ChipMultiSelectOption[];

  function startEditing() {
    setDraft(selected);
    setQuery('');
    setOpen(true);
  }

  function toggleDraft(code: string) {
    setDraft((prev) => (prev.includes(code) ? prev.filter((value) => value !== code) : [...prev, code]));
  }

  const draftSelected = draft.map((code) => byCode.get(code)).filter(Boolean) as ChipMultiSelectOption[];
  const folded = fold(query.trim());
  const available = options.filter(
    (option) => !draft.includes(option.code) && (folded === '' || fold(option.label).includes(folded)),
  );

  return (
    <div className="cms">
      <div className="cms__trigger">
        {selectedOptions.length > 0 ? (
          <ChipSet>
            {selectedOptions.map((option) => (
              // A selected chip in the trigger removes itself (live — single onChange, no stale closure).
              <Chip
                key={option.code}
                label={option.label}
                on
                sm
                title={chipTitle?.(option.code) ?? 'Retirer'}
                onClick={() => onChange(selected.filter((code) => code !== option.code))}
              />
            ))}
          </ChipSet>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>Aucune sélection</span>
        )}
        <button type="button" className="rep-add" onClick={startEditing}>
          {selectedOptions.length > 0 ? 'Choisir / modifier' : 'Choisir…'}
        </button>
      </div>

      <EditorModal
        open={open}
        title={title}
        saveLabel="Valider"
        onClose={() => setOpen(false)}
        onSave={() => {
          onChange(draft);
          setOpen(false);
        }}
      >
        <Input
          value={query}
          aria-label="Rechercher"
          placeholder={searchPlaceholder ?? 'Rechercher…'}
          onChange={setQuery}
        />
        <div className="chip-group__label" style={{ marginTop: 12 }}>
          Sélectionnés ({draft.length})
        </div>
        {draftSelected.length > 0 ? (
          <ChipSet>
            {draftSelected.map((option) => (
              <Chip key={option.code} label={option.label} on sm title="Retirer" onClick={() => toggleDraft(option.code)} />
            ))}
          </ChipSet>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>Aucune sélection</span>
        )}
        <div className="chip-group__label" style={{ marginTop: 12 }}>
          Disponibles
        </div>
        <ChipSet>
          {available.map((option) => (
            <Chip key={option.code} label={option.label} sm={sm} onClick={() => toggleDraft(option.code)} />
          ))}
        </ChipSet>
      </EditorModal>
    </div>
  );
}
