import { useState } from 'react';
import { ChipMultiSelect, Field, Fs, Input, Repeater, Select, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import type { ObjectWorkspaceMenu, ObjectWorkspaceMenuItem } from '../../../../services/object-workspace-parser';
import { ModuleUnavailableNotice, OwnedElsewhereNote } from './block-notes';
import { MenuItemsModal } from '../../widgets/MenuItemsModal';
import { MenuPdfCartes } from '../../widgets/MenuPdfCartes';

const MENU_COLS = '14px 36px 1fr 90px 96px auto';

function createMenu(index: number, category = { id: '', code: '', label: '' }): ObjectWorkspaceMenu {
  return {
    recordId: null,
    categoryId: category.id,
    categoryCode: category.code,
    categoryLabel: category.label,
    name: '',
    description: '',
    active: true,
    visibility: 'public',
    position: String(index + 1),
    items: [],
  };
}

export function BlockRES({ editor, permissions, folded }: SectionProps) {
  const menus = editor.draft.menus;
  const cuisine = editor.draft.cuisine;
  const openings = editor.draft.openings;
  const capacity = editor.draft.capacityPolicies;
  const firstMenu = menus.items[0];
  const activeMenus = menus.items.filter((menu) => menu.active).length;
  const [itemsModalIndex, setItemsModalIndex] = useState<number | null>(null);
  const itemsModalMenu = itemsModalIndex == null ? null : menus.items[itemsModalIndex];

  function replaceMenus(items: ObjectWorkspaceMenu[]) {
    editor.replaceModule('menus', { ...menus, items });
  }

  function updateMenu(index: number, patch: Partial<ObjectWorkspaceMenu>) {
    replaceMenus(menus.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function saveMenuItems(index: number, items: ObjectWorkspaceMenuItem[]) {
    updateMenu(index, { items });
    setItemsModalIndex(null);
  }

  return (
    <Fs
      num="06"
      title="Cuisine, cartes & service"
      sub="Cuisines proposées (recherche globale) · cartes & menus — capacité groupes en §07, horaires en §14"
      folded={folded}
      pill={{
        tone: activeMenus > 0 ? 'ok' : 'warn',
        label: activeMenus > 0 ? `${activeMenus} carte(s) active(s)` : 'Aucune carte',
      }}
    >
      {/* §06 P1 — Bloc A : « Cuisines proposées » est une facette GLOBALE de recherche au niveau
          objet (object_cuisine_type), INDÉPENDANTE des menus : on peut la renseigner sans aucune
          carte. (Elle ne vit plus sur le 1er plat du 1er menu — fin du write-trap.) */}
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

      {/* §06 P1 — Bloc B : cartes & menus. La sélection de cuisine a quitté ce bloc (Bloc A).
          La saisie item-par-item structurée arrive en P2 ; l'upload PDF réel en P3. */}
      <div className="chip-group__label" style={{ marginTop: 18 }}>
        Cartes & menus
      </div>
      {menus.unavailableReason ? (
        <ModuleUnavailableNotice reason={menus.unavailableReason} />
      ) : (
        <>
          <Repeater
            items={menus.items}
            getKey={(item, index) => item.recordId ?? `menu-${index}`}
            columns={MENU_COLS}
            addLabel="Ajouter un menu / une carte"
            onAdd={() => replaceMenus([...menus.items, createMenu(menus.items.length, menus.categoryOptions[0])])}
            renderRow={(menu, index) => (
              <>
                <span className="rep-row__handle" aria-hidden />
                <div className="sync-row__src">PDF</div>
                <div>
                  <Input value={menu.name} placeholder="Nom de la carte" onChange={(name) => updateMenu(index, { name })} />
                  {menu.description && (
                    <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 3 }}>{menu.description}</div>
                  )}
                </div>
                <Select
                  value={menu.categoryCode}
                  options={menus.categoryOptions.map((option) => ({ v: option.code, l: option.label }))}
                  onChange={(categoryCode) => {
                    const opt = menus.categoryOptions.find((o) => o.code === categoryCode);
                    updateMenu(index, {
                      categoryCode,
                      categoryId: opt?.id ?? menu.categoryId,
                      categoryLabel: opt?.label ?? menu.categoryLabel,
                    });
                  }}
                />
                <button
                  type="button"
                  className="pill-mini"
                  style={{ cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--surface)' }}
                  onClick={() => setItemsModalIndex(index)}
                >
                  Plats ({menu.items.length})
                </button>
                <div className="rep-row__act">
                  <Toggle label="" on={menu.active} onChange={(active) => updateMenu(index, { active })} />
                  <button type="button" className="del" onClick={() => replaceMenus(menus.items.filter((_, i) => i !== index))}>
                    ×
                  </button>
                </div>
              </>
            )}
          />

          <div className="grid-2" style={{ marginTop: 8 }}>
            <button type="button" className="dropzone" style={{ padding: 12 }} onClick={() => replaceMenus([...menus.items, createMenu(menus.items.length, menus.categoryOptions[0])])}>
              <span className="ico">+</span>
              <strong>Ajouter une carte / section</strong>
              <small>Puis « Plats » pour saisir les entrées, plats, desserts…</small>
            </button>
            <Field label="Notes menu" hint="Description affichée sous le titre de carte">
              <Input
                value={firstMenu?.description ?? ''}
                placeholder="FR · pages · date de mise à jour"
                onChange={(description) => firstMenu && updateMenu(0, { description })}
              />
            </Field>
          </div>
        </>
      )}

      {/* §06 P3 — Bloc C : cartes PDF téléchargeables, attachées au restaurant (object_document).
          Vrai upload (réutilise /api/document/upload) avec dates de validité — remplace le dropzone factice. */}
      <div className="chip-group__label" style={{ marginTop: 18 }}>
        Cartes PDF (téléchargeables)
      </div>
      <MenuPdfCartes
        objectId={editor.objectId}
        canEdit={permissions.menus.canDirectWrite || permissions.menus.canPrepareProposal}
      />

      {itemsModalMenu && (
        <MenuItemsModal
          open
          menuName={itemsModalMenu.name}
          items={itemsModalMenu.items}
          dietaryOptions={menus.dietaryTagOptions}
          allergenOptions={menus.allergenOptions}
          priceUnitOptions={menus.priceUnitOptions}
          onClose={() => setItemsModalIndex(null)}
          onSave={(items) => saveMenuItems(itemsModalIndex as number, items)}
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
