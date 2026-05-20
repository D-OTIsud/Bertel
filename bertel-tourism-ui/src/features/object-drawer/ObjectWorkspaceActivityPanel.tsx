import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type { ObjectWorkspaceActivityModule } from '../../services/object-workspace-parser';
import { Input } from '@/components/ui/input';
import { WorkspaceField, WorkspaceSection } from './workspace-ui';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceActivityPanelProps {
  value: ObjectWorkspaceActivityModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (patch: Partial<ObjectWorkspaceActivityModule>) => void;
  onSave: () => void;
}

export function ObjectWorkspaceActivityPanel({
  value,
  saving,
  access,
  onChange,
}: ObjectWorkspaceActivityPanelProps) {
  const disabled = !access.canDirectWrite || saving;

  return (
    <div className="drawer-form-stack">
      <WorkspaceSection eyebrow="Activite" title="Detail activite" help={access.disabledReason}>
        <div className="drawer-location-form-grid">
          <WorkspaceField label="Duree minutes" htmlFor="activity-duration">
            <Input id="activity-duration" value={value.durationMin} disabled={disabled} onChange={(event) => onChange({ durationMin: event.target.value })} />
          </WorkspaceField>
          <WorkspaceField label="Participants min." htmlFor="activity-min-participants">
            <Input id="activity-min-participants" value={value.minParticipants} disabled={disabled} onChange={(event) => onChange({ minParticipants: event.target.value })} />
          </WorkspaceField>
          <WorkspaceField label="Participants max." htmlFor="activity-max-participants">
            <Input id="activity-max-participants" value={value.maxParticipants} disabled={disabled} onChange={(event) => onChange({ maxParticipants: event.target.value })} />
          </WorkspaceField>
          <WorkspaceField label="Difficulte" htmlFor="activity-difficulty">
            <Input id="activity-difficulty" value={value.difficultyLevel} disabled={disabled} onChange={(event) => onChange({ difficultyLevel: event.target.value })} />
          </WorkspaceField>
          <WorkspaceField label="Age minimum" htmlFor="activity-min-age">
            <Input id="activity-min-age" value={value.minAge} disabled={disabled} onChange={(event) => onChange({ minAge: event.target.value })} />
          </WorkspaceField>
          <label className="workspace-toggle">
            <input type="checkbox" checked={value.guideRequired} disabled={disabled} onChange={(event) => onChange({ guideRequired: event.target.checked })} />
            <span>Guide requis</span>
          </label>
          <WorkspaceField label="Equipement fourni" htmlFor="activity-equipment" full>
            <textarea id="activity-equipment" className="workspace-textarea" value={value.equipmentProvided} disabled={disabled} onChange={(event) => onChange({ equipmentProvided: event.target.value })} />
          </WorkspaceField>
        </div>
      </WorkspaceSection>
    </div>
  );
}
