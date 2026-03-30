import type { ObjectWorkspaceGeneralInfo } from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceGeneralPanelProps {
  value: ObjectWorkspaceGeneralInfo;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  onChange: (patch: Partial<ObjectWorkspaceGeneralInfo>) => void;
  onSave: () => void;
}

export function ObjectWorkspaceGeneralPanel({
  value,
  dirty,
  saving,
  statusMessage,
  saveAction,
  onChange,
  onSave,
}: ObjectWorkspaceGeneralPanelProps) {
  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">A1</span>
            <h2>Infos generales</h2>
            <p>Cadrez les informations essentielles de la fiche sans melanger publication et moderation.</p>
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

          <div className="field-block">
            <Label htmlFor="workspace-commercial-visibility">Visibilite commerciale</Label>
          <select
              id="workspace-commercial-visibility"
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
              value={value.commercialVisibility}
              onChange={(event) => onChange({ commercialVisibility: event.target.value })}
            >
              <option value="active">active</option>
              <option value="lapsed">lapsed</option>
              <option value="suspended">suspended</option>
            </select>
          </div>
        </div>
      </article>

      <article className="panel-card panel-card--nested">
        <span className="facet-title">Cadre</span>
        <p>Le statut editorial, la moderation et la publication vivent maintenant dans le module A3 dedie. A1 reste centre sur l identite racine et les parametres metier generaux.</p>
      </article>
    </div>
  );
}
