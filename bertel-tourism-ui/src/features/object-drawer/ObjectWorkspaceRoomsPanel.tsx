import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type { ObjectWorkspaceRoomTypeItem, ObjectWorkspaceRoomsModule, WorkspaceReferenceOption } from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { WorkspaceEmptyState, WorkspaceField, WorkspaceRepeatedCard, WorkspaceSection } from './workspace-ui';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceRoomsPanelProps {
  value: ObjectWorkspaceRoomsModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceRoomsModule) => void;
  onSave: () => void;
}

function toggleCode(codes: string[], code: string, checked: boolean): string[] {
  if (!code) {
    return codes;
  }
  if (checked) {
    return Array.from(new Set([...codes, code]));
  }
  return codes.filter((item) => item !== code);
}

function OptionChecklist({
  options,
  selectedCodes,
  disabled,
  onChange,
}: {
  options: WorkspaceReferenceOption[];
  selectedCodes: string[];
  disabled: boolean;
  onChange: (nextCodes: string[]) => void;
}) {
  if (options.length === 0) {
    return <WorkspaceEmptyState title="Aucune reference disponible" />;
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

function createRoom(index: number, viewType?: WorkspaceReferenceOption): ObjectWorkspaceRoomTypeItem {
  return {
    recordId: null,
    code: `unit-${index + 1}`,
    name: '',
    nameTranslations: {},
    description: '',
    descriptionTranslations: {},
    capacityAdults: '',
    capacityChildren: '',
    capacityTotal: '',
    sizeSqm: '',
    bedConfig: '',
    bedConfigTranslations: {},
    quantity: '',
    floorLevel: '',
    viewTypeId: viewType?.id ?? '',
    viewTypeCode: viewType?.code ?? '',
    viewTypeLabel: viewType?.label ?? '',
    basePrice: '',
    currency: 'EUR',
    accessible: false,
    published: true,
    position: String(index + 1),
    amenityCodes: [],
    mediaIds: [],
  };
}

export function ObjectWorkspaceRoomsPanel({
  value,
  saving,
  access,
  onChange,
}: ObjectWorkspaceRoomsPanelProps) {
  const disabled = !access.canDirectWrite || saving;

  function replaceItems(items: ObjectWorkspaceRoomTypeItem[]) {
    onChange({ ...value, items });
  }

  function updateItem(index: number, patch: Partial<ObjectWorkspaceRoomTypeItem>) {
    replaceItems(value.items.map((item, itemIndex) => {
      if (itemIndex !== index) {
        return item;
      }
      const viewType = patch.viewTypeCode
        ? value.viewTypeOptions.find((option) => option.code === patch.viewTypeCode)
        : null;
      return {
        ...item,
        ...patch,
        viewTypeId: viewType?.id ?? patch.viewTypeId ?? item.viewTypeId,
        viewTypeLabel: viewType?.label ?? patch.viewTypeLabel ?? item.viewTypeLabel,
      };
    }));
  }

  return (
    <div className="drawer-form-stack">
      <WorkspaceSection
        eyebrow="Hebergement"
        title="Chambres et unites"
        help={access.disabledReason}
        actions={(
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => replaceItems([...value.items, createRoom(value.items.length, value.viewTypeOptions[0])])}
          >
            Ajouter
          </Button>
        )}
      >
        {value.items.length === 0 ? (
          <WorkspaceEmptyState title="Aucune chambre ou unite" />
        ) : (
          <div className="stack-list">
            {value.items.map((item, index) => (
              <WorkspaceRepeatedCard
                key={item.recordId ?? `room-${index}`}
                title={item.name || item.code || `Unite ${index + 1}`}
                meta={item.published ? 'Publie' : 'Brouillon'}
                actions={(
                  <Button type="button" variant="ghost" disabled={disabled} onClick={() => replaceItems(value.items.filter((_, itemIndex) => itemIndex !== index))}>
                    Retirer
                  </Button>
                )}
              >
                <div className="drawer-location-form-grid">
                  <WorkspaceField label="Code" htmlFor={`room-code-${index}`}>
                    <Input id={`room-code-${index}`} value={item.code} disabled={disabled} onChange={(event) => updateItem(index, { code: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Nom" htmlFor={`room-name-${index}`}>
                    <Input id={`room-name-${index}`} value={item.name} disabled={disabled} onChange={(event) => updateItem(index, { name: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Capacite totale" htmlFor={`room-capacity-total-${index}`}>
                    <Input id={`room-capacity-total-${index}`} value={item.capacityTotal} disabled={disabled} onChange={(event) => updateItem(index, { capacityTotal: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Adultes" htmlFor={`room-capacity-adults-${index}`}>
                    <Input id={`room-capacity-adults-${index}`} value={item.capacityAdults} disabled={disabled} onChange={(event) => updateItem(index, { capacityAdults: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Enfants" htmlFor={`room-capacity-children-${index}`}>
                    <Input id={`room-capacity-children-${index}`} value={item.capacityChildren} disabled={disabled} onChange={(event) => updateItem(index, { capacityChildren: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Surface m2" htmlFor={`room-size-${index}`}>
                    <Input id={`room-size-${index}`} value={item.sizeSqm} disabled={disabled} onChange={(event) => updateItem(index, { sizeSqm: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Lits" htmlFor={`room-beds-${index}`}>
                    <Input id={`room-beds-${index}`} value={item.bedConfig} disabled={disabled} onChange={(event) => updateItem(index, { bedConfig: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Quantite" htmlFor={`room-quantity-${index}`}>
                    <Input id={`room-quantity-${index}`} value={item.quantity} disabled={disabled} onChange={(event) => updateItem(index, { quantity: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Etage / niveau" htmlFor={`room-floor-${index}`}>
                    <Input id={`room-floor-${index}`} value={item.floorLevel} disabled={disabled} onChange={(event) => updateItem(index, { floorLevel: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Vue" htmlFor={`room-view-${index}`}>
                    <Select id={`room-view-${index}`} value={item.viewTypeCode} disabled={disabled} onChange={(event) => updateItem(index, { viewTypeCode: event.target.value })}>
                      <option value="">Non renseigne</option>
                      {value.viewTypeOptions.map((option) => (
                        <option key={option.code} value={option.code}>{option.label}</option>
                      ))}
                    </Select>
                  </WorkspaceField>
                  <WorkspaceField label="Prix base" htmlFor={`room-price-${index}`}>
                    <Input id={`room-price-${index}`} value={item.basePrice} disabled={disabled} onChange={(event) => updateItem(index, { basePrice: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Devise" htmlFor={`room-currency-${index}`}>
                    <Input id={`room-currency-${index}`} value={item.currency} disabled={disabled} onChange={(event) => updateItem(index, { currency: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Position" htmlFor={`room-position-${index}`}>
                    <Input id={`room-position-${index}`} value={item.position} disabled={disabled} onChange={(event) => updateItem(index, { position: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Description" htmlFor={`room-description-${index}`} full>
                    <textarea id={`room-description-${index}`} className="workspace-textarea" value={item.description} disabled={disabled} onChange={(event) => updateItem(index, { description: event.target.value })} />
                  </WorkspaceField>
                  <label className="workspace-toggle">
                    <input type="checkbox" checked={item.accessible} disabled={disabled} onChange={(event) => updateItem(index, { accessible: event.target.checked })} />
                    <span>Accessible</span>
                  </label>
                  <label className="workspace-toggle">
                    <input type="checkbox" checked={item.published} disabled={disabled} onChange={(event) => updateItem(index, { published: event.target.checked })} />
                    <span>Publie</span>
                  </label>
                  <WorkspaceField label="Equipements" full>
                    <OptionChecklist options={value.amenityOptions} selectedCodes={item.amenityCodes} disabled={disabled} onChange={(amenityCodes) => updateItem(index, { amenityCodes })} />
                  </WorkspaceField>
                  <WorkspaceField label="Medias lies" full>
                    <div className="workspace-choice-grid">
                      {value.mediaOptions.length === 0 ? <WorkspaceEmptyState title="Aucun media disponible" /> : value.mediaOptions.map((option) => (
                        <label key={option.id} className="workspace-choice">
                          <input
                            type="checkbox"
                            checked={item.mediaIds.includes(option.id)}
                            disabled={disabled}
                            onChange={(event) => {
                              const mediaIds = event.target.checked
                                ? Array.from(new Set([...item.mediaIds, option.id]))
                                : item.mediaIds.filter((mediaId) => mediaId !== option.id);
                              updateItem(index, { mediaIds });
                            }}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </WorkspaceField>
                </div>
              </WorkspaceRepeatedCard>
            ))}
          </div>
        )}
      </WorkspaceSection>
    </div>
  );
}
