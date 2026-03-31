import type { ObjectWorkspaceLocationModule } from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceLocationPanelProps {
  value: ObjectWorkspaceLocationModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  onChange: (patch: Partial<ObjectWorkspaceLocationModule['main']>) => void;
  onSave: () => void;
}

export function ObjectWorkspaceLocationPanel({
  value,
  dirty,
  saving,
  statusMessage,
  saveAction,
  onChange,
  onSave,
}: ObjectWorkspaceLocationPanelProps) {
  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <h2>Localisation</h2>
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
          <div className="field-block field-block--wide">
            <Label htmlFor="workspace-location-address1">Adresse principale</Label>
            <Input
              id="workspace-location-address1"
              value={value.main.address1}
              onChange={(event) => onChange({ address1: event.target.value })}
            />
          </div>

          <div className="field-block">
            <Label htmlFor="workspace-location-postcode">Code postal</Label>
            <Input
              id="workspace-location-postcode"
              value={value.main.postcode}
              onChange={(event) => onChange({ postcode: event.target.value })}
            />
          </div>

          <div className="field-block">
            <Label htmlFor="workspace-location-city">Ville</Label>
            <Input
              id="workspace-location-city"
              value={value.main.city}
              onChange={(event) => onChange({ city: event.target.value })}
            />
          </div>

          <div className="field-block">
            <Label htmlFor="workspace-location-lieudit">Lieu-dit</Label>
            <Input
              id="workspace-location-lieudit"
              value={value.main.lieuDit}
              onChange={(event) => onChange({ lieuDit: event.target.value })}
            />
          </div>

          <div className="field-block">
            <Label htmlFor="workspace-location-direction">Indications</Label>
            <Input
              id="workspace-location-direction"
              value={value.main.direction}
              onChange={(event) => onChange({ direction: event.target.value })}
            />
          </div>

          <div className="field-block">
            <Label htmlFor="workspace-location-latitude">Latitude</Label>
            <Input
              id="workspace-location-latitude"
              value={value.main.latitude}
              onChange={(event) => onChange({ latitude: event.target.value })}
            />
          </div>

          <div className="field-block">
            <Label htmlFor="workspace-location-longitude">Longitude</Label>
            <Input
              id="workspace-location-longitude"
              value={value.main.longitude}
              onChange={(event) => onChange({ longitude: event.target.value })}
            />
          </div>

          <div className="field-block">
            <Label htmlFor="workspace-location-zone">Zone touristique</Label>
            <Input
              id="workspace-location-zone"
              value={value.main.zoneTouristique}
              onChange={(event) => onChange({ zoneTouristique: event.target.value })}
            />
          </div>
        </div>
      </article>

      <div className="drawer-grid">
        <article className="panel-card panel-card--nested">
          <span className="facet-title">Sous-lieux</span>
          <div className="stack-list">
            {value.places.length > 0 ? value.places.map((place) => (
              <article key={place.id} className="panel-card panel-card--nested">
                <strong>{place.label}</strong>
                <p>{place.locationLabel || 'Aucune localisation dediee remontee.'}</p>
                {place.isPrimary && <small>Sous-lieu principal</small>}
              </article>
            )) : <p>Aucun sous-lieu.</p>}
          </div>
        </article>

        <article className="panel-card panel-card--nested">
          <span className="facet-title">Zones</span>
          <div className="stack-list">
            {value.zoneCodes.length > 0 ? value.zoneCodes.map((code) => (
              <span key={code} className="drawer-header__chip">{code}</span>
            )) : <p>Aucune zone.</p>}
          </div>
        </article>
      </div>
    </div>
  );
}
