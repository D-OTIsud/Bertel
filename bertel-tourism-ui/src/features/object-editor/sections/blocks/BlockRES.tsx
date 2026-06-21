import { useState } from 'react';
import { Plus, UtensilsCrossed } from 'lucide-react';
import { ChipMultiSelect, Field, Fs, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import type { ObjectWorkspaceMenu } from '../../../../services/object-workspace-parser';
import { ModuleUnavailableNotice, OwnedElsewhereNote } from './block-notes';
import { MenuEditModal } from '../../widgets/MenuItemsModal';
import { MenuPdfCartes } from '../../widgets/MenuPdfCartes';

/** A fresh, empty menu (titled container — no category; sections live on its dishes since §06 P2b). */
function createMenu(index: number): ObjectWorkspaceMenu {
  return {
    recordId: null,
    categoryId: '',
    categoryCode: '',
    categoryLabel: '',
    name: '',
    description: '',
    active: true,
    visibility: 'public',
    position: String(index + 1),
    items: [],
  };
}

const MENU_CARD = {
  display: 'flex', alignItems: 'center', gap: 12,
  border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px',
  background: 'var(--surface)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
} as const;
const MENU_ICON = {
  display: 'grid', placeItems: 'center', width: 38, height: 38, flexShrink: 0,
  borderRadius: 10, background: 'var(--bg-tint)', color: 'var(--ink-2)',
} as const;

/** A one-line menu summary for the card: the sections present + the dish count. */
function menuSummary(menu: ObjectWorkspaceMenu): string {
  if (menu.items.length === 0) return 'Vide — « Modifier » pour composer le menu';
  const sections = Array.from(new Set(menu.items.map((it) => it.sectionLabel).filter(Boolean)));
  return `${sections.join(' · ') || 'Sans section'} · ${menu.items.length} plat(s)`;
}

export function BlockRES({ editor, permissions, folded }: SectionProps) {
  const menus = editor.draft.menus;
  const cuisine = editor.draft.cuisine;
  const openings = editor.draft.openings;
  const capacity = editor.draft.capacityPolicies;
  const activeMenus = menus.items.filter((menu) => menu.active).length;
  // null = closed ; 'new' = creating ; { index } = editing an existing menu.
  const [editing, setEditing] = useState<'new' | { index: number } | null>(null);

  function replaceMenus(items: ObjectWorkspaceMenu[]) {
    editor.replaceModule('menus', { ...menus, items });
  }
  function updateMenu(index: number, patch: Partial<ObjectWorkspaceMenu>) {
    replaceMenus(menus.items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
  function saveMenu(savedMenu: ObjectWorkspaceMenu) {
    if (editing === 'new') {
      replaceMenus([...menus.items, savedMenu]);
    } else if (editing) {
      replaceMenus(menus.items.map((m, i) => (i === editing.index ? savedMenu : m)));
    }
    setEditing(null);
  }

  return (
    <Fs
      num="06"
      title="Cuisine, cartes & service"
      sub="Cuisines proposées (recherche globale) · menus (titre → sections → plats) · cartes PDF — capacité groupes en §07, horaires en §14"
      folded={folded}
      pill={{
        tone: activeMenus > 0 ? 'ok' : 'warn',
        label: activeMenus > 0 ? `${activeMenus} menu(s) actif(s)` : 'Aucun menu',
      }}
    >
      {/* §06 P1 — Bloc A : « Cuisines proposées » = facette GLOBALE de recherche au niveau objet
          (object_cuisine_type), INDÉPENDANTE des menus. Fin du write-trap. */}
      <div className="chip-group__label" style={{ marginTop: 0 }}>
        Cuisines proposées
      </div>
      <Field label="Types de cuisine" hint="Multi-sélection — la 1ère est la cuisine principale (recherche globale, pas par plat)">
        {cuisine.unavailableReason ? (
          <ModuleUnavailableNotice reason={cuisine.unavailableReason} />
        ) : (
          <ChipMultiSelect
            options={cuisine.options}
            selected={cuisine.codes}
            modalTitle="Choisir les types de cuisine"
            searchPlaceholder="Rechercher une cuisine…"
            onChange={(codes) => editor.replaceModule('cuisine', { ...cuisine, codes })}
          />
        )}
      </Field>

      {/* §06 P2b — Bloc B : menus structurés à 3 niveaux. « Ajouter un menu » → modale (titre →
          sections Entrée/Plat/Dessert… → plats). Chaque menu = un object_menu ; la section vit
          sur le plat (object_menu_item.section_id). */}
      <div className="chip-group__label" style={{ marginTop: 18 }}>
        Menus
      </div>
      {menus.unavailableReason ? (
        <ModuleUnavailableNotice reason={menus.unavailableReason} />
      ) : (
        <>
          {menus.items.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>
              Aucun menu pour le moment. Ajoutez un menu (titre, puis des sections et leurs plats).
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {menus.items.map((menu, index) => (
                <div key={menu.recordId ?? `menu-${index}`} style={MENU_CARD}>
                  <span style={{ ...MENU_ICON, opacity: menu.active ? 1 : 0.5 }} aria-hidden>
                    <UtensilsCrossed size={18} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0, opacity: menu.active ? 1 : 0.55 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.2 }}>
                      {menu.name || 'Menu sans titre'}
                    </div>
                    <div
                      className="muted"
                      style={{ fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {menuSummary(menu)}
                    </div>
                  </div>
                  <Toggle label="" on={menu.active} onChange={(active) => updateMenu(index, { active })} />
                  <button
                    type="button"
                    className="pill-mini"
                    style={{ cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--bg-tint)', fontWeight: 600 }}
                    onClick={() => setEditing({ index })}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="del"
                    aria-label={`Supprimer le menu ${menu.name || index + 1}`}
                    onClick={() => replaceMenus(menus.items.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="rep-add" style={{ marginTop: 8 }} onClick={() => setEditing('new')}>
            <Plus size={14} aria-hidden /> Ajouter un menu
          </button>
        </>
      )}

      {/* §06 P3 — Bloc C : cartes PDF téléchargeables, attachées au restaurant (object_document). */}
      <div className="chip-group__label" style={{ marginTop: 18 }}>
        Cartes PDF (téléchargeables)
      </div>
      <MenuPdfCartes
        objectId={editor.objectId}
        canEdit={permissions.menus.canDirectWrite || permissions.menus.canPrepareProposal}
      />

      {editing !== null && (
        <MenuEditModal
          open
          menu={editing === 'new' ? createMenu(menus.items.length) : menus.items[editing.index]}
          sectionOptions={menus.categoryOptions}
          dietaryOptions={menus.dietaryTagOptions}
          allergenOptions={menus.allergenOptions}
          onClose={() => setEditing(null)}
          onSave={saveMenu}
        />
      )}

      {/* §48 single-owner: ces concerns vivent ailleurs — pointeurs « géré ailleurs » en bas de §06. */}
      <OwnedElsewhereNote
        num="07"
        label="Capacité & accueil"
        summary={
          capacity.groupPolicy.minSize || capacity.groupPolicy.maxSize
            ? `Groupes ${capacity.groupPolicy.minSize || '—'}–${capacity.groupPolicy.maxSize || '—'} pers.`
            : undefined
        }
      />
      <OwnedElsewhereNote num="14" label="Périodes d'ouverture" summary={`${openings.periods.length} période(s)`} />
    </Fs>
  );
}
