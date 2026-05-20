import { Fs, Field, Input, Chip, ChipSet } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceLocationForm } from '../../../services/object-workspace-parser';
import { Provenance, type ProvenanceSource } from '../widgets/Provenance';

function resolveSource(sourceSystem: string): ProvenanceSource {
  const normalized = sourceSystem.toLowerCase();
  if (normalized.includes('apidae')) return 'Apidae';
  if (normalized.includes('datatourisme')) return 'DataTourisme';
  if (normalized.includes('insee') || normalized.includes('sirene')) return 'INSEE';
  if (normalized.includes('oti')) return 'OTI';
  return 'Importé';
}

function importProvenance(sync?: SectionProps['editor']['draft']['syncIdentifiers']) {
  const origin = sync?.origins[0];
  if (origin) {
    return {
      source: resolveSource(origin.sourceSystem),
      who: origin.sourceObjectId || origin.importBatchId,
      when: origin.updatedAt || origin.createdAt || origin.firstImportedAt,
    };
  }
  return null;
}

/** Section 03 — address, commune, GPS (design: edit-primitives + map-shell). */
export function SectionLocation({ editor, folded }: SectionProps) {
  const location = editor.draft.location;
  const main = location.main;
  const provenance = importProvenance(editor.draft.syncIdentifiers);
  const hasCoords = Boolean(main.latitude?.trim() && main.longitude?.trim());

  function patch(next: Partial<ObjectWorkspaceLocationForm>) {
    editor.replaceModule('location', { ...location, main: { ...main, ...next } });
  }

  return (
    <Fs
      num="03"
      title="Localisation"
      sub="Adresse postale, commune, lieu-dit, zone touristique, coordonnées GPS"
      folded={folded}
      pill={{ tone: hasCoords ? 'ok' : 'warn', label: hasCoords ? 'Géocodé' : 'GPS manquant' }}
    >
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <Field label="Adresse" required>
          <Input value={main.address1} onChange={(v) => patch({ address1: v })} />
        </Field>
        <Field label="Complément (lieu-dit interne)">
          <Input value={main.address2} onChange={(v) => patch({ address2: v })} placeholder="Bras-Long" />
        </Field>
      </div>

      <div className="grid-4" style={{ marginBottom: 12 }}>
        <Field label="Code postal" required>
          <Input value={main.postcode} onChange={(v) => patch({ postcode: v })} mono />
        </Field>
        <Field label="Bureau postal" hint="Ex : Le Tampon">
          <Input value={main.address3} onChange={(v) => patch({ address3: v })} />
        </Field>
        <Field label="Commune">
          <Input value={main.city} onChange={(v) => patch({ city: v })} />
        </Field>
        <Field label="Zone touristique" hint="Backfill via correspondance lieu_dit → zone">
          <Input value={main.zoneTouristique} onChange={(v) => patch({ zoneTouristique: v })} />
        </Field>
      </div>

      <Field label="Lieu-dit (Lieux-dits / formulaire)" hint="Valeur brute trimée — colonne source canonique">
        <Input value={main.lieuDit} onChange={(v) => patch({ lieuDit: v })} placeholder="Bras-Long" />
        {provenance && <Provenance {...provenance} />}
      </Field>

      <div style={{ marginTop: 12 }}>
        <div className="field__label" style={{ marginBottom: 5, display: 'flex', alignItems: 'center' }}>
          <span>
            Coordonnées GPS <span className="req"> *</span>
          </span>
          <button type="button" className="pill-mini" style={{ marginLeft: 'auto' }} disabled title="Bientôt">
            Géocoder l&apos;adresse
          </button>
        </div>
        <div className="map-shell">
          <div>
            <div className="grid-2" style={{ marginBottom: 6 }}>
              <Field label="Latitude">
                <Input value={main.latitude} onChange={(v) => patch({ latitude: v })} mono />
              </Field>
              <Field label="Longitude">
                <Input value={main.longitude} onChange={(v) => patch({ longitude: v })} mono />
              </Field>
            </div>
            <div className="chip-group__label">Localisations</div>
            <ChipSet>
              {location.zoneCodes.length > 0 ? (
                location.zoneCodes.map((z) => <Chip key={z} label={z} on sm />)
              ) : (
                <Chip label="Aucune étiquette zone" sm />
              )}
            </ChipSet>
          </div>
          <div className="map-mini" aria-hidden>
            <div className="crosshair" />
            <div className="pin" />
          </div>
        </div>
      </div>
    </Fs>
  );
}
