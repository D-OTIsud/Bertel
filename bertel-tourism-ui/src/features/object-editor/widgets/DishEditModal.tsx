import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { EditorModal, Field, Input, Textarea, Chip, ChipSet, Toggle } from '../primitives';
import type { ObjectWorkspaceMenuItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';
import { toggleItemCode } from '../sections/blocks/menu-items';

interface DishEditModalProps {
  open: boolean;
  dish: ObjectWorkspaceMenuItem;
  /** Section the dish belongs to (Entrée/Plat/Dessert…), shown in the title. */
  sectionLabel: string;
  dietaryOptions: WorkspaceReferenceOption[];
  allergenOptions: WorkspaceReferenceOption[];
  onClose: () => void;
  onSave: (dish: ObjectWorkspaceMenuItem) => void;
  /** Present for an existing dish — offers a delete action inside the modal. */
  onDelete?: () => void;
}

/**
 * §06 P2c — single-dish editor (object_menu_item): name, price, description/ingrédients, régimes,
 * allergènes, disponibilité, + delete. Opened from a menu's expanded section (one dish at a time).
 * Cuisine is NOT authored per dish (global object-level facet, §06 P1); unit is dropped (flat price).
 */
export function DishEditModal({
  open, dish, sectionLabel, dietaryOptions, allergenOptions, onClose, onSave, onDelete,
}: DishEditModalProps) {
  const [draft, setDraft] = useState(dish);
  const set = (patch: Partial<ObjectWorkspaceMenuItem>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <EditorModal
      open={open}
      title={sectionLabel ? `Plat — ${sectionLabel}` : 'Plat'}
      onClose={onClose}
      onSave={() => onSave(draft)}
    >
      <Field label="Nom du plat">
        <Input value={draft.name} placeholder="ex. Cari poulet" onChange={(name) => set({ name })} />
      </Field>

      <div style={{ maxWidth: 160 }}>
        <Field label="Prix">
          <Input
            type="number"
            value={draft.price}
            mono
            suffix={draft.currency === 'EUR' ? '€' : draft.currency}
            aria-label="Prix du plat"
            onChange={(price) => set({ price })}
          />
        </Field>
      </div>

      <Field label="Description / ingrédients">
        <Textarea value={draft.description} rows={3} onChange={(description) => set({ description })} />
      </Field>

      {dietaryOptions.length > 0 && (
        <>
          <div className="chip-group__label" style={{ margin: 0 }}>Régimes</div>
          <ChipSet>
            {dietaryOptions.map((o) => (
              <Chip key={o.code} label={o.label} sm on={draft.dietaryTagCodes.includes(o.code)}
                onClick={() => set({ dietaryTagCodes: toggleItemCode(draft.dietaryTagCodes, o.code) })} />
            ))}
          </ChipSet>
        </>
      )}

      {allergenOptions.length > 0 && (
        <>
          <div className="chip-group__label" style={{ margin: 0 }}>Allergènes</div>
          <ChipSet>
            {allergenOptions.map((o) => (
              <Chip key={o.code} label={o.label} sm on={draft.allergenCodes.includes(o.code)}
                onClick={() => set({ allergenCodes: toggleItemCode(draft.allergenCodes, o.code) })} />
            ))}
          </ChipSet>
        </>
      )}

      <Toggle label="Disponible" on={draft.available} onChange={(available) => set({ available })} />

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
            background: 'transparent', border: 'none', color: 'var(--danger, #c0392b)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0,
          }}
        >
          <Trash2 size={15} aria-hidden /> Supprimer ce plat
        </button>
      )}
    </EditorModal>
  );
}
