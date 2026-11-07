import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Trash2, UtensilsCrossed } from 'lucide-react';
import { Toggle } from '../primitives';
import { groupItemsBySection } from '../sections/blocks/menu-items';
import type { ObjectWorkspaceMenu, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';

interface MenuCardProps {
  menu: ObjectWorkspaceMenu;
  /** Sections vocabulary (menu_category) — for ordering the read-only display. */
  sectionOptions: WorkspaceReferenceOption[];
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (active: boolean) => void;
}

const CARD = { border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' } as const;
const HEADER = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' } as const;
const ICON = { display: 'grid', placeItems: 'center', width: 36, height: 36, flexShrink: 0, borderRadius: 10, background: 'var(--bg-tint)', color: 'var(--ink-2)' } as const;
const BODY = { padding: '4px 14px 14px', borderTop: '1px solid var(--line)' } as const;
const SECTION_HEAD = { display: 'flex', alignItems: 'baseline', gap: 8, margin: '10px 0 4px' } as const;
const DISH_ROW = { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: '1px solid var(--line)' } as const;
const ICON_BTN = { display: 'inline-grid', placeItems: 'center', width: 30, height: 30, border: '1px solid transparent', borderRadius: 8, background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer' } as const;
const PLAIN_BTN = { background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-grid', placeItems: 'center', color: 'var(--ink-3)' } as const;

function summarize(menu: ObjectWorkspaceMenu): string {
  if (menu.items.length === 0) return 'Vide — « Modifier » pour composer le menu';
  const sections = Array.from(new Set(menu.items.map((it) => it.sectionLabel).filter(Boolean)));
  return `${sections.join(' · ') || 'Sans section'} · ${menu.items.length} plat(s)`;
}

/**
 * §06 P2c — READ-ONLY collapsible menu card (display only). Collapsed: icon + title + summary +
 * active toggle + Modifier (pencil → opens the edit modal via onEdit) + Supprimer (trash → onDelete).
 * Expanded: the menu's sections (Entrée/Plat/Dessert…) each listing its dishes (name + price), purely
 * for viewing. All editing happens in MenuEditModal — the card never mutates the menu inline.
 */
export function MenuCard({ menu, sectionOptions, onEdit, onDelete, onToggleActive }: MenuCardProps) {
  const [expanded, setExpanded] = useState(false);
  const sectionRef = sectionOptions.map((o) => ({ code: o.code, label: o.label }));
  const groups = groupItemsBySection(menu.items, sectionRef);

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
        <Toggle label="" on={menu.active} onChange={onToggleActive} />
        <button type="button" style={ICON_BTN} aria-label={`Modifier le menu ${menu.name || ''}`} onClick={onEdit}>
          <Pencil size={16} aria-hidden />
        </button>
        <button type="button" style={ICON_BTN} aria-label={`Supprimer le menu ${menu.name || ''}`} onClick={onDelete}>
          <Trash2 size={16} aria-hidden />
        </button>
      </div>

      {expanded && (
        <div style={BODY}>
          {menu.items.length === 0 ? (
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Menu vide — « Modifier » pour le composer.</p>
          ) : (
            groups.map((group) => (
              <div key={group.code || 'sans-section'}>
                <div style={SECTION_HEAD}>
                  <strong style={{ fontSize: 13 }}>{group.label || 'Sans section'}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>{group.dishes.length} plat(s)</span>
                </div>
                {group.dishes.map(({ item, index }) => (
                  <div key={item.recordId ?? `dish-${index}`} style={DISH_ROW}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, opacity: item.available ? 1 : 0.5 }}>
                      {item.name || 'Plat sans nom'}
                      {!item.available && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>(indisponible)</span>}
                    </span>
                    <span className="mono" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {item.price ? `${item.price} ${item.currency === 'EUR' ? '€' : item.currency}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
