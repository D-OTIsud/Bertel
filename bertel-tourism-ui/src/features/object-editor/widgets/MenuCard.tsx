import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import { Field, Input, ReferenceSelect, Toggle } from '../primitives';
import { DishEditModal } from './MenuItemsModal';
import { createMenuItem, groupItemsBySection, removeMenuItem, updateMenuItem } from '../sections/blocks/menu-items';
import type { ObjectWorkspaceMenu, ObjectWorkspaceMenuItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';

interface MenuCardProps {
  menu: ObjectWorkspaceMenu;
  /** Sections vocabulary (menu_category). */
  sectionOptions: WorkspaceReferenceOption[];
  dietaryOptions: WorkspaceReferenceOption[];
  allergenOptions: WorkspaceReferenceOption[];
  onChange: (menu: ObjectWorkspaceMenu) => void;
  onDelete: () => void;
}

type DishTarget = { index: number } | { section: { code: string; label: string } };

const CARD = { border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' } as const;
const HEADER = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' } as const;
const ICON = { display: 'grid', placeItems: 'center', width: 36, height: 36, flexShrink: 0, borderRadius: 10, background: 'var(--bg-tint)', color: 'var(--ink-2)' } as const;
const BODY = { padding: '4px 14px 14px', borderTop: '1px solid var(--line)' } as const;
const SECTION_HEAD = { display: 'flex', alignItems: 'baseline', gap: 8, margin: '12px 0 6px' } as const;
const DISH_ROW = { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--line)' } as const;
const ICON_BTN = { display: 'inline-grid', placeItems: 'center', width: 30, height: 30, border: '1px solid transparent', borderRadius: 8, background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer' } as const;
const PLAIN_BTN = { background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-grid', placeItems: 'center', color: 'var(--ink-3)' } as const;

function summarize(menu: ObjectWorkspaceMenu): string {
  if (menu.items.length === 0) return 'Vide — déployez pour composer le menu';
  const sections = Array.from(new Set(menu.items.map((it) => it.sectionLabel).filter(Boolean)));
  return `${sections.join(' · ') || 'Sans section'} · ${menu.items.length} plat(s)`;
}

/**
 * §06 P2c — collapsible menu card. Collapsed: icon + title + summary + active toggle + delete.
 * Expanded: editable title, then the menu's SECTIONS (Entrée/Plat/Dessert…) each listing its dishes
 * (name + price, read-only) with per-dish edit (pencil) / delete (trash) icons, an "Ajouter un plat"
 * per section, and an "Ajouter une section" picker. Editing/adding a dish opens DishEditModal. The
 * menu data is controlled — every change flows up via onChange (the menus saver persists on save).
 */
export function MenuCard({ menu, sectionOptions, dietaryOptions, allergenOptions, onChange, onDelete }: MenuCardProps) {
  const isNew = !menu.name && menu.items.length === 0;
  const [expanded, setExpanded] = useState(isNew);
  const [editing, setEditing] = useState<DishTarget | null>(null);
  const [extraSections, setExtraSections] = useState<{ code: string; label: string }[]>([]);
  const [pendingSection, setPendingSection] = useState('');

  const sectionRef = sectionOptions.map((o) => ({ code: o.code, label: o.label }));
  const groups = groupItemsBySection(menu.items, sectionRef, extraSections);
  const usedCodes = new Set(groups.map((g) => g.code));
  const availableSections = sectionOptions.filter((o) => !usedCodes.has(o.code));

  const saveDish = (dish: ObjectWorkspaceMenuItem) => {
    if (editing && 'index' in editing) {
      onChange({ ...menu, items: updateMenuItem(menu.items, editing.index, dish) });
    } else if (editing && 'section' in editing) {
      onChange({ ...menu, items: [...menu.items, dish] });
    }
    setEditing(null);
  };
  const deleteDish = (index: number) => onChange({ ...menu, items: removeMenuItem(menu.items, index) });
  const addSection = () => {
    const opt = sectionOptions.find((o) => o.code === pendingSection);
    if (!opt) return;
    setExtraSections((s) => (s.some((e) => e.code === opt.code) ? s : [...s, { code: opt.code, label: opt.label }]));
    setPendingSection('');
  };

  const dishForModal = (): { dish: ObjectWorkspaceMenuItem; sectionLabel: string; onDelete?: () => void } | null => {
    if (!editing) return null;
    if ('index' in editing) {
      const i = editing.index;
      return { dish: menu.items[i], sectionLabel: menu.items[i].sectionLabel, onDelete: () => { deleteDish(i); setEditing(null); } };
    }
    return { dish: createMenuItem(menu.items.length, editing.section.code, editing.section.label), sectionLabel: editing.section.label };
  };
  const modal = dishForModal();

  return (
    <div style={CARD}>
      <div style={HEADER}>
        <button type="button" style={PLAIN_BTN} aria-label={expanded ? 'Replier le menu' : 'Déployer le menu'} onClick={() => setExpanded((e) => !e)}>
          {expanded ? <ChevronDown size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
        </button>
        <span style={{ ...ICON, opacity: menu.active ? 1 : 0.5 }} aria-hidden><UtensilsCrossed size={18} /></span>
        <div style={{ flex: 1, minWidth: 0, opacity: menu.active ? 1 : 0.55 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.2 }}>{menu.name || 'Menu sans titre'}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {summarize(menu)}
          </div>
        </div>
        <Toggle label="" on={menu.active} onChange={(active) => onChange({ ...menu, active })} />
        <button type="button" style={ICON_BTN} aria-label={`Supprimer le menu ${menu.name || ''}`} onClick={onDelete}>
          <Trash2 size={16} aria-hidden />
        </button>
      </div>

      {expanded && (
        <div style={BODY}>
          <Field label="Titre du menu" hint="ex. « Carte midi », « Menu enfant »">
            <Input value={menu.name} placeholder="Nom du menu" onChange={(name) => onChange({ ...menu, name })} />
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
                  <button type="button" style={ICON_BTN} aria-label={`Modifier ${item.name || 'le plat'}`} onClick={() => setEditing({ index })}>
                    <Pencil size={15} aria-hidden />
                  </button>
                  <button type="button" style={ICON_BTN} aria-label={`Supprimer ${item.name || 'le plat'}`} onClick={() => deleteDish(index)}>
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              ))}
              <button type="button" className="rep-add" onClick={() => setEditing({ section: { code: group.code, label: group.label } })}>
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
        </div>
      )}

      {modal && (
        <DishEditModal
          open
          dish={modal.dish}
          sectionLabel={modal.sectionLabel}
          dietaryOptions={dietaryOptions}
          allergenOptions={allergenOptions}
          onClose={() => setEditing(null)}
          onSave={saveDish}
          onDelete={modal.onDelete}
        />
      )}
    </div>
  );
}
