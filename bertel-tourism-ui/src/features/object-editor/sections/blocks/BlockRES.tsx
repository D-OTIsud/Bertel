import { Chip, ChipSet, Fs, Input, Repeater, ScheduleEditor, Select, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import type { ObjectWorkspaceMenu } from '../../../../services/object-workspace-parser';
import { applyRowsToFirstPeriod, scheduleRowsFromPeriod } from './opening-schedule';

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
  const firstMenu = menus.items[0];
  const firstItem = firstMenu?.items[0];

  function replaceMenus(items: ObjectWorkspaceMenu[]) {
    editor.replaceModule('menus', { ...menus, items });
  }

  function updateMenu(index: number, patch: Partial<ObjectWorkspaceMenu>) {
    replaceMenus(menus.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  return (
    <Fs num="05" title="Cuisine, cartes & service" sub="Cuisines, menus, cartes PDF et horaires midi/soir" folded={folded} pill={{ tone: 'ok', label: `${menus.items.length} menu(s)` }}>
      <div className="chip-group__label" style={{ marginTop: 0 }}>Identité culinaire</div>
      <ChipSet>
        {menus.cuisineTypeOptions.map((option) => {
          const selected = firstItem?.cuisineTypeCodes.includes(option.code) ?? false;
          return (
            <Chip
              key={option.code}
              label={option.label}
              on={selected}
              onClick={firstMenu && firstItem ? () => {
                updateMenu(0, {
                  items: firstMenu.items.map((item, itemIndex) => itemIndex === 0
                    ? {
                        ...item,
                        cuisineTypeCodes: selected
                          ? item.cuisineTypeCodes.filter((code) => code !== option.code)
                          : [...item.cuisineTypeCodes, option.code],
                      }
                    : item),
                });
              } : undefined}
            />
          );
        })}
      </ChipSet>

      <Repeater
        items={menus.items}
        getKey={(item, index) => item.recordId ?? `menu-${index}`}
        columns="1fr 1fr 90px 100px auto"
        addLabel="Ajouter un menu"
        onAdd={() => replaceMenus([...menus.items, createMenu(menus.items.length, menus.categoryOptions[0])])}
        renderRow={(menu, index) => (
          <>
            <Input value={menu.name} placeholder="Nom du menu" onChange={(name) => updateMenu(index, { name })} />
            <Select value={menu.categoryCode} options={menus.categoryOptions.map((option) => ({ v: option.code, l: option.label }))} onChange={(categoryCode) => updateMenu(index, { categoryCode })} />
            <Input value={menu.position} mono onChange={(position) => updateMenu(index, { position })} />
            <Toggle label="Actif" on={menu.active} onChange={(active) => updateMenu(index, { active })} />
            <button type="button" className="del" onClick={() => replaceMenus(menus.items.filter((_, itemIndex) => itemIndex !== index))}>Supprimer</button>
          </>
        )}
      />

      <div className="chip-group__label">Horaires de service</div>
      <ScheduleEditor
        rows={scheduleRowsFromPeriod(openings.periods[0])}
        onChange={(rows) => editor.replaceModule('openings', applyRowsToFirstPeriod(openings, rows))}
      />
    </Fs>
  );
}
