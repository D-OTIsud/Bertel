import { Fs, Field, Input } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceLocationForm } from '../../../services/object-workspace-parser';

/** Section 03 — postal address, commune, lieu-dit and GPS coordinates. */
export function SectionLocation({ editor }: SectionProps) {
  const location = editor.draft.location;
  const main = location.main;

  function patch(next: Partial<ObjectWorkspaceLocationForm>) {
    editor.replaceModule('location', { ...location, main: { ...main, ...next } });
  }

  return (
    <Fs num="03" title="Localisation" sub="Adresse postale, commune, lieu-dit, coordonnées GPS">
      <div className="grid-2">
        <Field label="Adresse" required>
          <Input value={main.address1} onChange={(v) => patch({ address1: v })} />
        </Field>
        <Field label="Complément d'adresse">
          <Input value={main.address2} onChange={(v) => patch({ address2: v })} />
        </Field>
      </div>
      <div className="grid-4">
        <Field label="Code postal">
          <Input value={main.postcode} onChange={(v) => patch({ postcode: v })} mono />
        </Field>
        <Field label="Commune">
          <Input value={main.city} onChange={(v) => patch({ city: v })} />
        </Field>
        <Field label="Lieu-dit">
          <Input value={main.lieuDit} onChange={(v) => patch({ lieuDit: v })} />
        </Field>
        <Field label="Zone touristique">
          <Input value={main.zoneTouristique} onChange={(v) => patch({ zoneTouristique: v })} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Latitude">
          <Input value={main.latitude} onChange={(v) => patch({ latitude: v })} mono />
        </Field>
        <Field label="Longitude">
          <Input value={main.longitude} onChange={(v) => patch({ longitude: v })} mono />
        </Field>
      </div>
    </Fs>
  );
}
