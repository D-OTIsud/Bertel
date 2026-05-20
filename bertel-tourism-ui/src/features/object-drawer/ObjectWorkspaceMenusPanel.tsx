import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type { ObjectWorkspaceMenu, ObjectWorkspaceMenuItem, ObjectWorkspaceMenusModule, WorkspaceReferenceOption } from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { WorkspaceEmptyState, WorkspaceField, WorkspaceRepeatedCard, WorkspaceSection } from './workspace-ui';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceMenusPanelProps {
  value: ObjectWorkspaceMenusModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceMenusModule) => void;
  onSave: () => void;
}

function toggleCode(codes: string[], code: string, checked: boolean): string[] {
  return toggleValue(codes, code, checked);
}

function toggleValue(values: string[], value: string, checked: boolean): string[] {
  if (!value) {
    return values;
  }
  if (checked) {
    return Array.from(new Set([...values, value]));
  }
  return values.filter((item) => item !== value);
}

function CodeChecklist({
  options,
  selectedCodes,
  disabled,
  emptyLabel,
  onChange,
}: {
  options: WorkspaceReferenceOption[];
  selectedCodes: string[];
  disabled: boolean;
  emptyLabel: string;
  onChange: (nextCodes: string[]) => void;
}) {
  if (options.length === 0) {
    return <WorkspaceEmptyState title={emptyLabel} />;
  }

  return (
    <div className="workspace-choice-grid">
      {options.map((option) => (
        <label key={option.code} className="workspace-choice">
          <input
            type="checkbox"
            checked={selectedCodes.includes(option.code)}
            disabled={disabled}
            onChange={(event) => onChange(toggleCode(selectedCodes, option.code, event.target.checked))}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

function MediaChecklist({
  options,
  selectedIds,
  disabled,
  onChange,
}: {
  options: WorkspaceReferenceOption[];
  selectedIds: string[];
  disabled: boolean;
  onChange: (nextIds: string[]) => void;
}) {
  if (options.length === 0) {
    return <WorkspaceEmptyState title="Aucun media disponible" />;
  }

  return (
    <div className="workspace-choice-grid">
      {options.map((option) => (
        <label key={option.id} className="workspace-choice">
          <input
            type="checkbox"
            checked={selectedIds.includes(option.id)}
            disabled={disabled}
            onChange={(event) => onChange(toggleValue(selectedIds, option.id, event.target.checked))}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

function createMenu(index: number, category?: WorkspaceReferenceOption): ObjectWorkspaceMenu {
  return {
    recordId: null,
    categoryId: category?.id ?? '',
    categoryCode: category?.code ?? '',
    categoryLabel: category?.label ?? '',
    name: '',
    description: '',
    active: true,
    visibility: 'public',
    position: String(index + 1),
    items: [],
  };
}

function createMenuItem(index: number, kind?: WorkspaceReferenceOption, unit?: WorkspaceReferenceOption): ObjectWorkspaceMenuItem {
  return {
    recordId: null,
    name: '',
    description: '',
    price: '',
    currency: 'EUR',
    kindId: kind?.id ?? '',
    kindCode: kind?.code ?? '',
    kindLabel: kind?.label ?? '',
    unitId: unit?.id ?? '',
    unitCode: unit?.code ?? '',
    unitLabel: unit?.label ?? '',
    mediaIds: [],
    available: true,
    position: String(index + 1),
    dietaryTagCodes: [],
    allergenCodes: [],
    cuisineTypeCodes: [],
  };
}

export function ObjectWorkspaceMenusPanel({
  value,
  saving,
  access,
  onChange,
}: ObjectWorkspaceMenusPanelProps) {
  const disabled = !access.canDirectWrite || saving;

  function replaceMenus(items: ObjectWorkspaceMenu[]) {
    onChange({ ...value, items });
  }

  function updateMenu(index: number, patch: Partial<ObjectWorkspaceMenu>) {
    replaceMenus(value.items.map((menu, menuIndex) => {
      if (menuIndex !== index) {
        return menu;
      }
      const category = patch.categoryCode
        ? value.categoryOptions.find((option) => option.code === patch.categoryCode)
        : null;
      return {
        ...menu,
        ...patch,
        categoryId: category?.id ?? patch.categoryId ?? menu.categoryId,
        categoryLabel: category?.label ?? patch.categoryLabel ?? menu.categoryLabel,
      };
    }));
  }

  function updateMenuItem(menuIndex: number, itemIndex: number, patch: Partial<ObjectWorkspaceMenuItem>) {
    updateMenu(menuIndex, {
      items: value.items[menuIndex].items.map((item, currentIndex) => {
        if (currentIndex !== itemIndex) {
          return item;
        }
        const kind = patch.kindCode
          ? value.priceKindOptions.find((option) => option.code === patch.kindCode)
          : null;
        const unit = patch.unitCode
          ? value.priceUnitOptions.find((option) => option.code === patch.unitCode)
          : null;
        return {
          ...item,
          ...patch,
          kindId: kind?.id ?? patch.kindId ?? item.kindId,
          kindLabel: kind?.label ?? patch.kindLabel ?? item.kindLabel,
          unitId: unit?.id ?? patch.unitId ?? item.unitId,
          unitLabel: unit?.label ?? patch.unitLabel ?? item.unitLabel,
        };
      }),
    });
  }

  return (
    <div className="drawer-form-stack">
      <WorkspaceSection
        eyebrow="Restaurant"
        title="Menus"
        help={access.disabledReason}
        actions={(
          <Button type="button" variant="ghost" disabled={disabled} onClick={() => replaceMenus([...value.items, createMenu(value.items.length, value.categoryOptions[0])])}>
            Ajouter un menu
          </Button>
        )}
      >
        {value.items.length === 0 ? (
          <WorkspaceEmptyState title="Aucun menu" />
        ) : (
          <div className="stack-list">
            {value.items.map((menu, menuIndex) => (
              <WorkspaceRepeatedCard
                key={menu.recordId ?? `menu-${menuIndex}`}
                title={menu.name || `Menu ${menuIndex + 1}`}
                meta={menu.active ? 'Actif' : 'Inactif'}
                actions={(
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() => updateMenu(menuIndex, {
                        items: [...menu.items, createMenuItem(menu.items.length, value.priceKindOptions[0], value.priceUnitOptions[0])],
                      })}
                    >
                      Ligne
                    </Button>
                    <Button type="button" variant="ghost" disabled={disabled} onClick={() => replaceMenus(value.items.filter((_, index) => index !== menuIndex))}>
                      Retirer
                    </Button>
                  </>
                )}
              >
                <div className="drawer-location-form-grid">
                  <WorkspaceField label="Categorie" htmlFor={`menu-category-${menuIndex}`}>
                    <Select id={`menu-category-${menuIndex}`} value={menu.categoryCode} disabled={disabled} onChange={(event) => updateMenu(menuIndex, { categoryCode: event.target.value })}>
                      <option value="">Non renseigne</option>
                      {value.categoryOptions.map((option) => (
                        <option key={option.code} value={option.code}>{option.label}</option>
                      ))}
                    </Select>
                  </WorkspaceField>
                  <WorkspaceField label="Nom" htmlFor={`menu-name-${menuIndex}`}>
                    <Input id={`menu-name-${menuIndex}`} value={menu.name} disabled={disabled} onChange={(event) => updateMenu(menuIndex, { name: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Visibilite" htmlFor={`menu-visibility-${menuIndex}`}>
                    <Select id={`menu-visibility-${menuIndex}`} value={menu.visibility} disabled={disabled} onChange={(event) => updateMenu(menuIndex, { visibility: event.target.value })}>
                      <option value="public">Public</option>
                      <option value="private">Interne</option>
                      <option value="draft">Brouillon</option>
                    </Select>
                  </WorkspaceField>
                  <WorkspaceField label="Position" htmlFor={`menu-position-${menuIndex}`}>
                    <Input id={`menu-position-${menuIndex}`} value={menu.position} disabled={disabled} onChange={(event) => updateMenu(menuIndex, { position: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Description" htmlFor={`menu-description-${menuIndex}`} full>
                    <textarea id={`menu-description-${menuIndex}`} className="workspace-textarea" value={menu.description} disabled={disabled} onChange={(event) => updateMenu(menuIndex, { description: event.target.value })} />
                  </WorkspaceField>
                  <label className="workspace-toggle">
                    <input type="checkbox" checked={menu.active} disabled={disabled} onChange={(event) => updateMenu(menuIndex, { active: event.target.checked })} />
                    <span>Actif</span>
                  </label>
                </div>

                <div className="workspace-nested-list">
                  {menu.items.length === 0 ? (
                    <WorkspaceEmptyState title="Aucune ligne de menu" />
                  ) : menu.items.map((item, itemIndex) => (
                    <article key={item.recordId ?? `menu-item-${menuIndex}-${itemIndex}`} className="panel-card panel-card--nested workspace-subcard">
                      <div className="workspace-repeated-card__header">
                        <h3>{item.name || `Ligne ${itemIndex + 1}`}</h3>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={disabled}
                          onClick={() => updateMenu(menuIndex, { items: menu.items.filter((_, index) => index !== itemIndex) })}
                        >
                          Retirer
                        </Button>
                      </div>
                      <div className="drawer-location-form-grid">
                        <WorkspaceField label="Nom" htmlFor={`menu-item-name-${menuIndex}-${itemIndex}`}>
                          <Input id={`menu-item-name-${menuIndex}-${itemIndex}`} value={item.name} disabled={disabled} onChange={(event) => updateMenuItem(menuIndex, itemIndex, { name: event.target.value })} />
                        </WorkspaceField>
                        <WorkspaceField label="Prix" htmlFor={`menu-item-price-${menuIndex}-${itemIndex}`}>
                          <Input id={`menu-item-price-${menuIndex}-${itemIndex}`} value={item.price} disabled={disabled} onChange={(event) => updateMenuItem(menuIndex, itemIndex, { price: event.target.value })} />
                        </WorkspaceField>
                        <WorkspaceField label="Devise" htmlFor={`menu-item-currency-${menuIndex}-${itemIndex}`}>
                          <Input id={`menu-item-currency-${menuIndex}-${itemIndex}`} value={item.currency} disabled={disabled} onChange={(event) => updateMenuItem(menuIndex, itemIndex, { currency: event.target.value })} />
                        </WorkspaceField>
                        <WorkspaceField label="Type de prix" htmlFor={`menu-item-kind-${menuIndex}-${itemIndex}`}>
                          <Select id={`menu-item-kind-${menuIndex}-${itemIndex}`} value={item.kindCode} disabled={disabled} onChange={(event) => updateMenuItem(menuIndex, itemIndex, { kindCode: event.target.value })}>
                            <option value="">Non renseigne</option>
                            {value.priceKindOptions.map((option) => (
                              <option key={option.code} value={option.code}>{option.label}</option>
                            ))}
                          </Select>
                        </WorkspaceField>
                        <WorkspaceField label="Unite" htmlFor={`menu-item-unit-${menuIndex}-${itemIndex}`}>
                          <Select id={`menu-item-unit-${menuIndex}-${itemIndex}`} value={item.unitCode} disabled={disabled} onChange={(event) => updateMenuItem(menuIndex, itemIndex, { unitCode: event.target.value })}>
                            <option value="">Non renseigne</option>
                            {value.priceUnitOptions.map((option) => (
                              <option key={option.code} value={option.code}>{option.label}</option>
                            ))}
                          </Select>
                        </WorkspaceField>
                        <WorkspaceField label="Medias lies" full>
                          <MediaChecklist
                            options={value.mediaOptions}
                            selectedIds={item.mediaIds}
                            disabled={disabled}
                            onChange={(mediaIds) => updateMenuItem(menuIndex, itemIndex, { mediaIds })}
                          />
                        </WorkspaceField>
                        <WorkspaceField label="Position" htmlFor={`menu-item-position-${menuIndex}-${itemIndex}`}>
                          <Input id={`menu-item-position-${menuIndex}-${itemIndex}`} value={item.position} disabled={disabled} onChange={(event) => updateMenuItem(menuIndex, itemIndex, { position: event.target.value })} />
                        </WorkspaceField>
                        <WorkspaceField label="Description" htmlFor={`menu-item-description-${menuIndex}-${itemIndex}`} full>
                          <textarea id={`menu-item-description-${menuIndex}-${itemIndex}`} className="workspace-textarea" value={item.description} disabled={disabled} onChange={(event) => updateMenuItem(menuIndex, itemIndex, { description: event.target.value })} />
                        </WorkspaceField>
                        <label className="workspace-toggle">
                          <input type="checkbox" checked={item.available} disabled={disabled} onChange={(event) => updateMenuItem(menuIndex, itemIndex, { available: event.target.checked })} />
                          <span>Disponible</span>
                        </label>
                        <WorkspaceField label="Tags alimentaires" full>
                          <CodeChecklist options={value.dietaryTagOptions} selectedCodes={item.dietaryTagCodes} disabled={disabled} emptyLabel="Aucun tag alimentaire" onChange={(dietaryTagCodes) => updateMenuItem(menuIndex, itemIndex, { dietaryTagCodes })} />
                        </WorkspaceField>
                        <WorkspaceField label="Allergenes" full>
                          <CodeChecklist options={value.allergenOptions} selectedCodes={item.allergenCodes} disabled={disabled} emptyLabel="Aucun allergene" onChange={(allergenCodes) => updateMenuItem(menuIndex, itemIndex, { allergenCodes })} />
                        </WorkspaceField>
                        <WorkspaceField label="Cuisines" full>
                          <CodeChecklist options={value.cuisineTypeOptions} selectedCodes={item.cuisineTypeCodes} disabled={disabled} emptyLabel="Aucune cuisine" onChange={(cuisineTypeCodes) => updateMenuItem(menuIndex, itemIndex, { cuisineTypeCodes })} />
                        </WorkspaceField>
                      </div>
                    </article>
                  ))}
                </div>
              </WorkspaceRepeatedCard>
            ))}
          </div>
        )}
      </WorkspaceSection>
    </div>
  );
}
