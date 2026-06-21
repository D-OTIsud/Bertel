import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { EditorModal, Field, Input, ReferenceSelect } from '../primitives';
import { DishEditModal } from './MenuItemsModal';
import { createMenuItem, groupItemsBySection, pruneBlankItems, removeMenuItem, updateMenuItem } from '../sections/blocks/menu-items';
import type { ObjectWorkspaceMenu, ObjectWorkspaceMenuItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';

interface MenuEditModalProps {
  open: boolean;
  menu: ObjectWorkspaceMenu;
  /** Sections vocabulary (menu_category: Entrée/Plat/Dessert/Boissons…). */
  sectionOptions: WorkspaceReferenceOption[];
  dietaryOptions: WorkspaceReferenceOption[];
  allergenOptions: WorkspaceReferenceOption[];
  onClose: () => void;
  onSave: (menu: ObjectWorkspaceMenu) => void;
}

type DishTarget = { index: number } | { section: { code: string; label: string } };

const SECTION_HEAD = { display: 'flex', alignItems: 'baseline', gap: 8, margin: '14px 0 6px', paddingTop: 12, borderTop: '1px solid var(--line)' } as const;
const DISH_ROW = { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0' } as const;
const ICON_BTN = { display: 'inline-grid', placeItems: 'center', width: 30, height: 30, border: '1px solid transparent', borderRadius: 8, background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer' } as const;

/**
 * §06 P2c — create/edit a whole MENU in a modal: title (object_menu.name) → SECTIONS
 * (Entrée/Plat/Dessert… = menu_category) → DISHES. Dishes are listed (name + price) with per-dish
 * edit (pencil → DishEditModal) / delete (trash) icons; add a dish per section, add a section. The
 * draft is local — committed as one menu via onSave (blank dishes pruned). The collapsible card is a
 * read-only display; ALL editing happens here. Cuisine is global (§06 P1), unit dropped (flat price).
 */
export function MenuEditModal({ open, menu, sectionOptions, dietaryOptions, allergenOptions, onClose, onSave }: MenuEditModalProps) {
  const [name, setName] = useState(menu.name);
  const [items, setItems] = useState<ObjectWorkspaceMenuItem[]>(menu.items);
  const [extraSections, setExtraSections] = useState<{ code: string; label: string }[]>([]);
  const [pendingSection, setPendingSection] = useState('');
  const [editingDish, setEditingDish] = useState<DishTarget | null>(null);

  const sectionRef = sectionOptions.map((o) => ({ code: o.code, label: o.label }));
  const groups = groupItemsBySection(items, sectionRef, extraSections);
  const usedCodes = new Set(groups.map((g) => g.code));
  const availableSections = sectionOptions.filter((o) => !usedCodes.has(o.code));

  const saveDish = (dish: ObjectWorkspaceMenuItem) => {
    setItems((list) => {
      if (editingDish && 'index' in editingDish) return updateMenuItem(list, editingDish.index, dish);
      if (editingDish && 'section' in editingDish) return [...list, dish];
      return list;
    });
    setEditingDish(null);
  };
  const deleteDish = (index: number) => setItems((list) => removeMenuItem(list, index));
  const addSection = () => {
    const opt = sectionOptions.find((o) => o.code === pendingSection);
    if (!opt) return;
    setExtraSections((s) => (s.some((e) => e.code === opt.code) ? s : [...s, { code: opt.code, label: opt.label }]));
    setPendingSection('');
  };

  const dishForModal = (): { dish: ObjectWorkspaceMenuItem; sectionLabel: string; onDelete?: () => void } | null => {
    if (!editingDish) return null;
    if ('index' in editingDish) {
      const i = editingDish.index;
      return { dish: items[i], sectionLabel: items[i].sectionLabel, onDelete: () => { deleteDish(i); setEditingDish(null); } };
    }
    return { dish: createMenuItem(items.length, editingDish.section.code, editingDish.section.label), sectionLabel: editingDish.section.label };
  };
  const dishModal = dishForModal();

  return (
    <EditorModal open={open} title={`Menu — ${name || 'Sans titre'}`} onClose={onClose} onSave={() => onSave({ ...menu, name, items: pruneBlankItems(items) })}>
      <Field label="Titre du menu" hint="ex. « Carte midi », « Menu enfant », « Carte des vins »">
        <Input value={name} placeholder="Nom du menu" onChange={setName} />
      </Field>

      {groups.length === 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Ajoutez une section (Entrée, Plat, Dessert…) puis ses plats.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.code || 'sans-section'}>
          <div style={SECTION_HEAD}>
            <strong style={{ fontSize: 13 }}>{group.label || 'Sans section'}</strong>
            <span className="muted" style={{ fontSize: 12 }}>{group.dishes.length} plat(s)</span>
          </div>
          {group.dishes.map(({ item, index }) => (
            <div key={item.recordId ?? `new-${index}`} style={DISH_ROW}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, opacity: item.available ? 1 : 0.5 }}>{item.name || 'Plat sans nom'}</span>
                {!item.available && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>(indisponible)</span>}
              </div>
              <span className="mono" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                {item.price ? `${item.price} ${item.currency === 'EUR' ? '€' : item.currency}` : '—'}
              </span>
              <button type="button" style={ICON_BTN} aria-label={`Modifier ${item.name || 'le plat'}`} onClick={() => setEditingDish({ index })}>
                <Pencil size={15} aria-hidden />
              </button>
              <button type="button" style={ICON_BTN} aria-label={`Supprimer ${item.name || 'le plat'}`} onClick={() => deleteDish(index)}>
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
          ))}
          <button type="button" className="rep-add" onClick={() => setEditingDish({ section: { code: group.code, label: group.label } })}>
            <Plus size={14} aria-hidden /> Ajouter un plat à « {group.label || 'Sans section'} »
          </button>
        </div>
      ))}

      {availableSections.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <span className="chip-group__label" style={{ margin: 0 }}>Ajouter une section</span>
          <div style={{ minWidth: 180 }}>
            <ReferenceSelect value={pendingSection} options={availableSections} allowEmpty emptyLabel="— Choisir —" aria-label="Choisir une section" onChange={(code) => setPendingSection(code)} />
          </div>
          <button type="button" className="rep-add" onClick={addSection} disabled={!pendingSection}>
            <Plus size={14} aria-hidden /> Ajouter
          </button>
        </div>
      )}

      {dishModal && (
        <DishEditModal
          open
          dish={dishModal.dish}
          sectionLabel={dishModal.sectionLabel}
          dietaryOptions={dietaryOptions}
          allergenOptions={allergenOptions}
          onClose={() => setEditingDish(null)}
          onSave={saveDish}
          onDelete={dishModal.onDelete}
        />
      )}
    </EditorModal>
  );
}
