import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { EditorModal, Field, Input, Textarea, ReferenceSelect, Chip, ChipSet, Toggle } from '../primitives';
import type { ObjectWorkspaceMenuItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';
import { addMenuItem, pruneBlankItems, removeMenuItem, toggleItemCode, updateMenuItem } from '../sections/blocks/menu-items';

interface MenuItemsModalProps {
  open: boolean;
  menuName: string;
  items: ObjectWorkspaceMenuItem[];
  dietaryOptions: WorkspaceReferenceOption[];
  allergenOptions: WorkspaceReferenceOption[];
  priceUnitOptions: WorkspaceReferenceOption[];
  onClose: () => void;
  onSave: (items: ObjectWorkspaceMenuItem[]) => void;
}

const CARD = {
  border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 10,
  display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-tint)',
} as const;
const ROW_HEAD = { display: 'grid', gridTemplateColumns: '1fr 36px', gap: 8, alignItems: 'end' } as const;
const COL2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as const;
const ICON_BTN = {
  display: 'inline-grid', placeItems: 'center', width: 32, height: 32,
  border: '1px solid transparent', borderRadius: 8, background: 'transparent',
  color: 'var(--ink-3)', cursor: 'pointer',
} as const;

/**
 * §06 P2 — structured carte editor for ONE menu section: add/edit/remove dishes
 * (object_menu_item) inline — name, price (+ unit), description/contenu, dietary tags, allergens,
 * availability. The menus saver already persists these; cuisine is NOT authored per dish (it is a
 * global object-level facet, §06 P1). Blank dishes are pruned on save.
 */
export function MenuItemsModal({
  open, menuName, items, dietaryOptions, allergenOptions, priceUnitOptions, onClose, onSave,
}: MenuItemsModalProps) {
  const [draft, setDraft] = useState(items);
  const set = (i: number, patch: Partial<ObjectWorkspaceMenuItem>) => setDraft((d) => updateMenuItem(d, i, patch));

  return (
    <EditorModal open={open} title={`Plats — ${menuName || 'Carte'}`} onClose={onClose} onSave={() => onSave(pruneBlankItems(draft))}>
      {draft.length === 0 && (
        <span className="muted" style={{ fontSize: 12 }}>
          Aucun plat pour le moment. Ajoutez une entrée, un plat, un dessert…
        </span>
      )}

      {draft.map((item, i) => (
        <div key={item.recordId ?? `new-${i}`} style={CARD}>
          <div style={ROW_HEAD}>
            <Field label="Nom du plat">
              <Input value={item.name} placeholder="ex. Cari poulet" onChange={(name) => set(i, { name })} />
            </Field>
            <button type="button" aria-label={`Supprimer le plat ${i + 1}`} style={ICON_BTN} onClick={() => setDraft((d) => removeMenuItem(d, i))}>
              <Trash2 size={15} aria-hidden />
            </button>
          </div>

          <div style={COL2}>
            <Field label="Prix">
              <Input
                type="number"
                value={item.price}
                mono
                suffix={item.currency === 'EUR' ? '€' : item.currency}
                aria-label={`Prix du plat ${i + 1}`}
                onChange={(price) => set(i, { price })}
              />
            </Field>
            <Field label="Unité">
              <ReferenceSelect
                value={item.unitCode}
                options={priceUnitOptions}
                allowEmpty
                emptyLabel="— Unité —"
                aria-label={`Unité du plat ${i + 1}`}
                onChange={(code, opt) => set(i, { unitCode: code, unitId: opt?.id ?? '', unitLabel: opt?.label ?? '' })}
              />
            </Field>
          </div>

          <Field label="Description / contenu">
            <Textarea value={item.description} rows={2} onChange={(description) => set(i, { description })} />
          </Field>

          {dietaryOptions.length > 0 && (
            <>
              <div className="chip-group__label" style={{ margin: 0 }}>Régimes</div>
              <ChipSet>
                {dietaryOptions.map((o) => (
                  <Chip
                    key={o.code}
                    label={o.label}
                    sm
                    on={item.dietaryTagCodes.includes(o.code)}
                    onClick={() => set(i, { dietaryTagCodes: toggleItemCode(item.dietaryTagCodes, o.code) })}
                  />
                ))}
              </ChipSet>
            </>
          )}

          {allergenOptions.length > 0 && (
            <>
              <div className="chip-group__label" style={{ margin: 0 }}>Allergènes</div>
              <ChipSet>
                {allergenOptions.map((o) => (
                  <Chip
                    key={o.code}
                    label={o.label}
                    sm
                    on={item.allergenCodes.includes(o.code)}
                    onClick={() => set(i, { allergenCodes: toggleItemCode(item.allergenCodes, o.code) })}
                  />
                ))}
              </ChipSet>
            </>
          )}

          <Toggle label="Disponible" on={item.available} onChange={(available) => set(i, { available })} />
        </div>
      ))}

      <button type="button" className="rep-add" onClick={() => setDraft((d) => addMenuItem(d))}>
        <Plus size={14} aria-hidden /> Ajouter un plat
      </button>
    </EditorModal>
  );
}
