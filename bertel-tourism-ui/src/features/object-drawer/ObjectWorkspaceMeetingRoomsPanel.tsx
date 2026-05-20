import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type { ObjectWorkspaceMeetingRoomItem, ObjectWorkspaceMeetingRoomsModule, WorkspaceReferenceOption } from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkspaceEmptyState, WorkspaceField, WorkspaceRepeatedCard, WorkspaceSection } from './workspace-ui';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceMeetingRoomsPanelProps {
  value: ObjectWorkspaceMeetingRoomsModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceMeetingRoomsModule) => void;
  onSave: () => void;
}

function toggleCode(codes: string[], code: string, checked: boolean): string[] {
  if (checked) {
    return Array.from(new Set([...codes, code]));
  }
  return codes.filter((item) => item !== code);
}

function EquipmentChecklist({
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
    return <WorkspaceEmptyState title="Aucun equipement MICE disponible" />;
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

function createMeetingRoom(): ObjectWorkspaceMeetingRoomItem {
  return {
    recordId: null,
    name: '',
    nameTranslations: {},
    areaM2: '',
    capacityTheatre: '',
    capacityU: '',
    capacityClassroom: '',
    capacityBoardroom: '',
    equipmentCodes: [],
  };
}

export function ObjectWorkspaceMeetingRoomsPanel({
  value,
  saving,
  access,
  onChange,
}: ObjectWorkspaceMeetingRoomsPanelProps) {
  const disabled = !access.canDirectWrite || saving;

  function replaceItems(items: ObjectWorkspaceMeetingRoomItem[]) {
    onChange({ ...value, items });
  }

  function updateItem(index: number, patch: Partial<ObjectWorkspaceMeetingRoomItem>) {
    replaceItems(value.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="drawer-form-stack">
      <WorkspaceSection
        eyebrow="MICE"
        title="Salles et capacites"
        help={access.disabledReason}
        actions={(
          <Button type="button" variant="ghost" disabled={disabled} onClick={() => replaceItems([...value.items, createMeetingRoom()])}>
            Ajouter
          </Button>
        )}
      >
        {value.items.length === 0 ? (
          <WorkspaceEmptyState title="Aucune salle MICE" />
        ) : (
          <div className="stack-list">
            {value.items.map((item, index) => (
              <WorkspaceRepeatedCard
                key={item.recordId ?? `meeting-room-${index}`}
                title={item.name || `Salle ${index + 1}`}
                meta={item.areaM2 ? `${item.areaM2} m2` : undefined}
                actions={(
                  <Button type="button" variant="ghost" disabled={disabled} onClick={() => replaceItems(value.items.filter((_, itemIndex) => itemIndex !== index))}>
                    Retirer
                  </Button>
                )}
              >
                <div className="drawer-location-form-grid">
                  <WorkspaceField label="Nom" htmlFor={`meeting-room-name-${index}`}>
                    <Input id={`meeting-room-name-${index}`} value={item.name} disabled={disabled} onChange={(event) => updateItem(index, { name: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Surface m2" htmlFor={`meeting-room-area-${index}`}>
                    <Input id={`meeting-room-area-${index}`} value={item.areaM2} disabled={disabled} onChange={(event) => updateItem(index, { areaM2: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Theatre" htmlFor={`meeting-room-theatre-${index}`}>
                    <Input id={`meeting-room-theatre-${index}`} value={item.capacityTheatre} disabled={disabled} onChange={(event) => updateItem(index, { capacityTheatre: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="U" htmlFor={`meeting-room-u-${index}`}>
                    <Input id={`meeting-room-u-${index}`} value={item.capacityU} disabled={disabled} onChange={(event) => updateItem(index, { capacityU: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Classe" htmlFor={`meeting-room-classroom-${index}`}>
                    <Input id={`meeting-room-classroom-${index}`} value={item.capacityClassroom} disabled={disabled} onChange={(event) => updateItem(index, { capacityClassroom: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Boardroom" htmlFor={`meeting-room-boardroom-${index}`}>
                    <Input id={`meeting-room-boardroom-${index}`} value={item.capacityBoardroom} disabled={disabled} onChange={(event) => updateItem(index, { capacityBoardroom: event.target.value })} />
                  </WorkspaceField>
                  <WorkspaceField label="Equipements" full>
                    <EquipmentChecklist
                      options={value.equipmentOptions}
                      selectedCodes={item.equipmentCodes}
                      disabled={disabled}
                      onChange={(equipmentCodes) => updateItem(index, { equipmentCodes })}
                    />
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
