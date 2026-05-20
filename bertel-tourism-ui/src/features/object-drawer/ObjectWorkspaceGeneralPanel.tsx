import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type { ObjectWorkspaceGeneralInfo, ObjectWorkspaceTaxonomyModule } from '../../services/object-workspace-parser';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ObjectWorkspaceTaxonomyFields } from './ObjectWorkspaceTaxonomyPanel';
import { WorkspaceTooltip } from './workspace-ui';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceGeneralPanelProps {
  value: ObjectWorkspaceGeneralInfo;
  taxonomy: ObjectWorkspaceTaxonomyModule;
  objectType?: string;
  objectTypeLabel?: string;
  taxonomyAccess: ObjectWorkspaceModuleAccess;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  onChange: (patch: Partial<ObjectWorkspaceGeneralInfo>) => void;
  onTaxonomyChange: (nextValue: ObjectWorkspaceTaxonomyModule) => void;
  onSave: () => void;
}

export function ObjectWorkspaceGeneralPanel({
  value,
  taxonomy,
  objectType,
  objectTypeLabel,
  taxonomyAccess,
  onChange,
  onTaxonomyChange,
}: ObjectWorkspaceGeneralPanelProps) {
  const normalizedObjectType = String(objectType ?? '').trim().toUpperCase();
  const resolvedObjectTypeLabel = String(objectTypeLabel ?? objectType ?? '').trim() || 'Type non renseigne';
  const shouldShowObjectTypeCode = normalizedObjectType
    && normalizedObjectType !== resolvedObjectTypeLabel.toUpperCase();

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Informations generales</span>
            <h2>Informations generales</h2>
          </div>
        </div>

        <div className="drawer-grid">
          <div className="field-block">
            <Label htmlFor="workspace-name">Nom principal</Label>
            <Input
              id="workspace-name"
              value={value.name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </div>
          <div className="field-block">
            <span>Type de fiche</span>
            <div className="drawer-reference-field">
              <div className="panel-card panel-card--nested">
                <strong>{resolvedObjectTypeLabel}</strong>
                {shouldShowObjectTypeCode ? (
                  <span className="status-pill status-pill--neutral">Code: {normalizedObjectType}</span>
                ) : null}
                <WorkspaceTooltip content="Le type pilote la taxonomie visible et les modules specifiques proposes dans ce panneau." />
              </div>
            </div>
          </div>
        </div>
      </article>

      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Taxonomie</span>
            <h3>Taxonomie structurante</h3>
          </div>
        </div>
      </article>

      <ObjectWorkspaceTaxonomyFields
        value={taxonomy}
        objectType={objectType}
        access={taxonomyAccess}
        onChange={onTaxonomyChange}
      />
    </div>
  );
}
