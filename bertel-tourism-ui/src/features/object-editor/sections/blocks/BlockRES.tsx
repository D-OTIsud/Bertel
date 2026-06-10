import { Chip, ChipSet, Field, Fs, Input, Repeater, Select, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import type { ObjectWorkspaceMenu } from '../../../../services/object-workspace-parser';
import { ModuleUnavailableNotice, OwnedElsewhereNote } from './block-notes';

const MENU_COLS = '14px 36px 1fr 90px 90px auto';

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

export function BlockRES({ editor, folded }: SectionProps) {
  const menus = editor.draft.menus;
  const openings = editor.draft.openings;
  const capacity = editor.draft.capacityPolicies;
  const firstMenu = menus.items[0];
  const firstItem = firstMenu?.items[0];
  const activeMenus = menus.items.filter((menu) => menu.active).length;

  function replaceMenus(items: ObjectWorkspaceMenu[]) {
    editor.replaceModule('menus', { ...menus, items });
  }

  function updateMenu(index: number, patch: Partial<ObjectWorkspaceMenu>) {
    replaceMenus(menus.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  return (
    <Fs
      num="05"
      title="Cuisine, cartes & service"
      sub="Cuisines, cartes & menus PDF — capacité groupes en §07, horaires en §14"
      folded={folded}
      pill={{
        tone: activeMenus > 0 ? 'ok' : 'warn',
        label: activeMenus > 0 ? `${activeMenus} carte(s) active(s)` : 'Aucune carte',
      }}
    >
      <div className="chip-group__label" style={{ marginTop: 0 }}>
        Identité culinaire
      </div>
      {/* §48 single-owner: the group policy is edited in §07 only (last-edit-wins trap otherwise) */}
      <OwnedElsewhereNote
        num="07"
        label="Capacité & cadre"
        summary={
          capacity.groupPolicy.minSize || capacity.groupPolicy.maxSize
            ? `Groupes ${capacity.groupPolicy.minSize || '—'}–${capacity.groupPolicy.maxSize || '—'} pers.`
            : undefined
        }
      />

      {/* §46 type-gated menus module — notice INSTEAD of controls when gated.
          The cuisine chips, the menu repeater and the PDF/notes grid all edit
          `menus` (cuisine codes live on menus.items[0].items[0]). */}
      {menus.unavailableReason ? (
        <ModuleUnavailableNotice reason={menus.unavailableReason} />
      ) : (
        <>
          <Field label="Cuisines proposées" hint="Multi-sélection — la 1ère sera la cuisine principale">
            <ChipSet>
              {menus.cuisineTypeOptions.map((option) => {
                const selected = firstItem?.cuisineTypeCodes.includes(option.code) ?? false;
                return (
                  <Chip
                    key={option.code}
                    label={option.label}
                    on={selected}
                    onClick={
                      firstMenu && firstItem
                        ? () => {
                            updateMenu(0, {
                              items: firstMenu.items.map((item, itemIndex) =>
                                itemIndex === 0
                                  ? {
                                      ...item,
                                      cuisineTypeCodes: selected
                                        ? item.cuisineTypeCodes.filter((code) => code !== option.code)
                                        : [...item.cuisineTypeCodes, option.code],
                                    }
                                  : item,
                              ),
                            });
                          }
                        : undefined
                    }
                  />
                );
              })}
            </ChipSet>
          </Field>

          <div className="chip-group__label" style={{ marginTop: 18 }}>
            Cartes & menus (PDF)
          </div>
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
                <span className="pill-mini">{menu.active ? 'Actif' : 'Inactif'}</span>
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
              <strong>Déposer un PDF de carte</strong>
              <small>Mise à jour conseillée tous les 3 mois</small>
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

      {/* §48 single-owner: service hours are edited in §14 only (last-edit-wins trap otherwise) */}
      <OwnedElsewhereNote num="14" label="Périodes d'ouverture" summary={`${openings.periods.length} période(s)`} />
    </Fs>
  );
}
