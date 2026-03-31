import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type { ObjectWorkspaceGeneralInfo, ObjectWorkspaceTaxonomyModule } from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ObjectWorkspaceTaxonomyFields } from './ObjectWorkspaceTaxonomyPanel';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceGeneralPanelProps {
  value: ObjectWorkspaceGeneralInfo;
  taxonomy: ObjectWorkspaceTaxonomyModule;
  objectType?: string;
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
  taxonomyAccess,
  dirty,
  saving,
  statusMessage,
  saveAction,
  onChange,
  onTaxonomyChange,
  onSave,
}: ObjectWorkspaceGeneralPanelProps) {
  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Informations generales</span>
            <h2>Informations generales et classements</h2>
            <p>Renseignez ici l identite de la fiche et ses classements utiles.</p>
          </div>
          <div className="stack-list text-right">
            <Button type="button" variant="outline" onClick={onSave} disabled={saveAction.disabled || saving || !dirty}>
              {saving ? 'Enregistrement...' : saveAction.label}
            </Button>
            {saveAction.hint && <small className="text-muted-foreground">{saveAction.hint}</small>}
            {statusMessage && <small className="text-muted-foreground">{statusMessage}</small>}
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
            <Label htmlFor="workspace-timezone">Fuseau horaire</Label>
            <Input
              id="workspace-timezone"
              value={value.businessTimezone}
              onChange={(event) => onChange({ businessTimezone: event.target.value })}
            />
          </div>

          <div className="field-block">
            <Label htmlFor="workspace-region-code">Code region</Label>
            <Input
              id="workspace-region-code"
              value={value.regionCode}
              onChange={(event) => onChange({ regionCode: event.target.value.toUpperCase() })}
            />
          </div>

        </div>
      </article>

      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Classements</span>
            <h2>Classements et categories</h2>
            <p>Seuls les classements adaptes a ce type de fiche sont proposes ici.</p>
          </div>
        </div>
      </article>

      <ObjectWorkspaceTaxonomyFields
        value={taxonomy}
        objectType={objectType}
        access={taxonomyAccess}
        onChange={onTaxonomyChange}
      />

      <article className="panel-card panel-card--nested">
        <span className="facet-title">Bon a savoir</span>
        <p>La visibilite commerciale, la publication et la moderation se gerent dans l onglet Publication.</p>
      </article>
    </div>
  );
}
