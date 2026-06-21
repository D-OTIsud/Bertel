import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { EditorModal, Field, Input, Textarea, ReferenceSelect, Chip, ChipSet, Toggle } from '../primitives';
// `ReferenceSelect` is still used by the "Ajouter une section" picker below.
import type { ObjectWorkspaceMenu, ObjectWorkspaceMenuItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';
import { createMenuItem, groupItemsBySection, pruneBlankItems, removeMenuItem, toggleItemCode, updateMenuItem } from '../sections/blocks/menu-items';

interface MenuEditModalProps {
  open: boolean;
  menu: ObjectWorkspaceMenu;
  /** Sections vocabulary (= menu_category catalog: Entrée/Plat/Dessert/Boissons…). */
  sectionOptions: WorkspaceReferenceOption[];
  dietaryOptions: WorkspaceReferenceOption[];
  allergenOptions: WorkspaceReferenceOption[];
  onClose: () => void;
  onSave: (menu: ObjectWorkspaceMenu) => void;
}

const CARD = {
  border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 10,
  display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-tint)',
} as const;
const ROW_HEAD = { display: 'grid', gridTemplateColumns: '1fr 36px', gap: 8, alignItems: 'end' } as const;
const SECTION_HEAD = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  margin: '14px 0 8px', paddingTop: 12, borderTop: '1px solid var(--line)',
} as const;
const ICON_BTN = {
  display: 'inline-grid', placeItems: 'center', width: 32, height: 32,
  border: '1px solid transparent', borderRadius: 8, background: 'transparent',
  color: 'var(--ink-3)', cursor: 'pointer',
} as const;

/** One dish: name, price (+unit), description/contenu, dietary tags, allergens, availability. */
function DishCard({
  item, index, dietaryOptions, allergenOptions, onPatch, onRemove,
}: {
  item: ObjectWorkspaceMenuItem;
  index: number;
  dietaryOptions: WorkspaceReferenceOption[];
  allergenOptions: WorkspaceReferenceOption[];
  onPatch: (patch: Partial<ObjectWorkspaceMenuItem>) => void;
  onRemove: () => void;
}) {
  return (
    <div style={CARD}>
      <div style={ROW_HEAD}>
        <Field label="Nom du plat">
          <Input value={item.name} placeholder="ex. Cari poulet" onChange={(name) => onPatch({ name })} />
        </Field>
        <button type="button" aria-label={`Supprimer le plat ${index + 1}`} style={ICON_BTN} onClick={onRemove}>
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
      <div style={{ maxWidth: 160 }}>
        <Field label="Prix">
          <Input
            type="number"
            value={item.price}
            mono
            suffix={item.currency === 'EUR' ? '€' : item.currency}
            aria-label={`Prix du plat ${index + 1}`}
            onChange={(price) => onPatch({ price })}
          />
        </Field>
      </div>
      <Field label="Description / ingrédients">
        <Textarea value={item.description} rows={2} onChange={(description) => onPatch({ description })} />
      </Field>
      {dietaryOptions.length > 0 && (
        <>
          <div className="chip-group__label" style={{ margin: 0 }}>Régimes</div>
          <ChipSet>
            {dietaryOptions.map((o) => (
              <Chip key={o.code} label={o.label} sm on={item.dietaryTagCodes.includes(o.code)}
                onClick={() => onPatch({ dietaryTagCodes: toggleItemCode(item.dietaryTagCodes, o.code) })} />
            ))}
          </ChipSet>
        </>
      )}
      {allergenOptions.length > 0 && (
        <>
          <div className="chip-group__label" style={{ margin: 0 }}>Allergènes</div>
          <ChipSet>
            {allergenOptions.map((o) => (
              <Chip key={o.code} label={o.label} sm on={item.allergenCodes.includes(o.code)}
                onClick={() => onPatch({ allergenCodes: toggleItemCode(item.allergenCodes, o.code) })} />
            ))}
          </ChipSet>
        </>
      )}
      <Toggle label="Disponible" on={item.available} onChange={(available) => onPatch({ available })} />
    </div>
  );
}

/**
 * §06 P2b — full structured-carte editor for ONE menu: a TITLE (object_menu.name) → SECTIONS
 * (Entrée/Plat/Dessert/Boissons… = menu_category, carried by each dish's section_id) → DISHES
 * (object_menu_item: name, price+unit, description/ingrédients, régimes, allergènes). Blank dishes
 * are pruned on save. The menus saver persists everything; cuisine is NOT authored per dish (§06 P1).
 */
export function MenuEditModal({
  open, menu, sectionOptions, dietaryOptions, allergenOptions, onClose, onSave,
}: MenuEditModalProps) {
  const [name, setName] = useState(menu.name);
  const [items, setItems] = useState<ObjectWorkspaceMenuItem[]>(menu.items);
  const [extraSections, setExtraSections] = useState<{ code: string; label: string }[]>([]);
  const [pendingSection, setPendingSection] = useState('');

  const sectionRef = useMemo(() => sectionOptions.map((o) => ({ code: o.code, label: o.label })), [sectionOptions]);
  const groups = groupItemsBySection(items, sectionRef, extraSections);
  const usedCodes = new Set(groups.map((g) => g.code));
  const availableSections = sectionOptions.filter((o) => !usedCodes.has(o.code));

  const patchDish = (index: number, patch: Partial<ObjectWorkspaceMenuItem>) =>
    setItems((list) => updateMenuItem(list, index, patch));
  const removeDish = (index: number) => setItems((list) => removeMenuItem(list, index));
  const addDish = (code: string, label: string) =>
    setItems((list) => [...list, createMenuItem(list.length, code, label)]);
  const addSection = () => {
    const opt = sectionOptions.find((o) => o.code === pendingSection);
    if (!opt) return;
    setExtraSections((s) => (s.some((e) => e.code === opt.code) ? s : [...s, { code: opt.code, label: opt.label }]));
    setPendingSection('');
  };

  return (
    <EditorModal
      open={open}
      title={`Menu — ${name || 'Sans titre'}`}
      onClose={onClose}
      onSave={() => onSave({ ...menu, name, items: pruneBlankItems(items) })}
    >
      <Field label="Titre du menu" hint="ex. « Carte midi », « Menu enfant », « Carte des vins »">
        <Input value={name} placeholder="Nom du menu" onChange={setName} />
      </Field>

      {groups.length === 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Aucune section. Ajoutez une section (Entrée, Plat, Dessert…) puis ses plats.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.code || 'sans-section'}>
          <div style={SECTION_HEAD}>
            <strong style={{ fontSize: 13 }}>{group.label || 'Sans section'}</strong>
            <span className="muted" style={{ fontSize: 12 }}>{group.dishes.length} plat(s)</span>
          </div>
          {group.dishes.map(({ item, index }) => (
            <DishCard
              key={item.recordId ?? `new-${index}`}
              item={item}
              index={index}
              dietaryOptions={dietaryOptions}
              allergenOptions={allergenOptions}
              onPatch={(patch) => patchDish(index, patch)}
              onRemove={() => removeDish(index)}
            />
          ))}
          <button type="button" className="rep-add" onClick={() => addDish(group.code, group.label)}>
            <Plus size={14} aria-hidden /> Ajouter un plat à « {group.label || 'Sans section'} »
          </button>
        </div>
      ))}

      {availableSections.length > 0 && (
        <div style={{ ...SECTION_HEAD, justifyContent: 'flex-start', gap: 8 }}>
          <span className="chip-group__label" style={{ margin: 0 }}>Ajouter une section</span>
          <div style={{ minWidth: 180 }}>
            <ReferenceSelect
              value={pendingSection}
              options={availableSections}
              allowEmpty
              emptyLabel="— Choisir —"
              aria-label="Choisir une section"
              onChange={(code) => setPendingSection(code)}
            />
          </div>
          <button type="button" className="rep-add" onClick={addSection} disabled={!pendingSection}>
            <Plus size={14} aria-hidden /> Ajouter
          </button>
        </div>
      )}
    </EditorModal>
  );
}
