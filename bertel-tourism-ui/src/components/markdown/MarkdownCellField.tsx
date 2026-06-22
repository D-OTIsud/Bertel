'use client';

import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { EditorModal } from '../../features/object-editor/primitives/EditorModal';
import { MarkdownEditorLazy } from './MarkdownEditorLazy';
import { MarkdownContent } from './MarkdownContent';

type MarkdownCellFieldProps = {
  value: string;
  onChange: (markdown: string) => void;
  variant?: 'block' | 'inline';
  /** Accessible label for the WYSIWYG textarea inside the modal. */
  ariaLabel: string;
  /** Title shown in the modal header. Defaults to a generic label so it never
   *  conflicts with ariaLabel in aria-labelledby lookups. */
  label?: string;
  disabled?: boolean;
  emptyLabel?: string;
};

/** Compact repeater-cell surface for a Markdown field: a clamped preview + a button that opens a
 *  modal hosting the WYSIWYG. A full toolbar will not fit a grid row, so authoring happens in the
 *  modal; the cell shows the rendered preview. Mirrors AdaptedDescriptionField, generalized to a
 *  single (already language-resolved) string value. */
export function MarkdownCellField({
  value, onChange, variant = 'block', ariaLabel, label = 'Modifier le texte', disabled, emptyLabel = 'Aucune description',
}: MarkdownCellFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  function openModal() {
    setDraft(value);
    setOpen(true);
  }
  function save() {
    onChange(draft);
    setOpen(false);
  }

  const filled = value.trim() !== '';

  return (
    <div className="md-cell">
      {filled ? (
        <MarkdownContent markdown={value} className="md-cell__preview" />
      ) : (
        <span className="md-cell__empty muted">{emptyLabel}</span>
      )}
      {!disabled && (
        <button type="button" className="btn md-cell__btn" onClick={openModal}>
          {filled ? <><Pencil size={14} aria-hidden /> Modifier</> : <><Plus size={14} aria-hidden /> Ajouter</>}
        </button>
      )}

      <EditorModal open={open} title={label} size="lg" onClose={() => setOpen(false)} onSave={save}>
        <MarkdownEditorLazy value={draft} onChange={setDraft} variant={variant} ariaLabel={ariaLabel} disabled={disabled} />
      </EditorModal>
    </div>
  );
}
