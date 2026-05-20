import { Fs, Field, Input, Select, Chip, ChipSet } from '../primitives';
import type { SectionProps } from './section-types';
import { Provenance, type ProvenanceSource } from '../widgets/Provenance';
import { ARCHETYPE_META } from '../archetypes';

const STATUS_OPTIONS = [
  { v: 'published', l: '🟢 Publié — en ligne' },
  { v: 'draft', l: '🟡 Brouillon' },
  { v: 'hidden', l: '🔴 Hors ligne' },
  { v: 'archived', l: '⚫ Archivé' },
];

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
  const external = sync?.externalIdentifiers[0];
  if (external) {
    return {
      source: resolveSource(external.sourceSystem),
      who: external.externalId,
      when: external.lastSyncedAt || external.updatedAt || external.createdAt,
    };
  }
  return null;
}

/** Section 01 — commercial name, publication status, and taxonomy (design: edit-primitives). */
export function SectionIdentity({ editor, objectId, archetype, folded }: SectionProps) {
  const info = editor.draft.generalInfo;
  const taxonomy = editor.draft.taxonomy;
  const provider = editor.draft.provider;
  const provenance = importProvenance(editor.draft.syncIdentifiers);
  const meta = archetype ? ARCHETYPE_META[archetype] : null;
  const typeLabel = meta ? `${archetype} — ${meta.codeName}` : archetype ?? '';
  const legalName = provider?.companyName || '';
  const id = objectId ?? '';
  const refShort = id.length > 12 ? id.slice(0, 12) : id;
  const taxoPath = taxonomy.domains[0]?.assignment?.path.map((n) => n.label).join(' ▸ ') ?? '';

  return (
    <Fs
      num="01"
      title="Identité & taxonomie"
      sub="Nom commercial, type principal, sous-catégorie métier, statut"
      folded={folded}
      pill={{ tone: 'ok', label: 'OK' }}
    >
      <div className="grid-2-1" style={{ marginBottom: 12 }}>
        <Field label="Nom commercial" required>
          <Input value={info.name} onChange={(name) => editor.patchModule('generalInfo', { name })} lg />
          {provenance && <Provenance {...provenance} />}
        </Field>
        <Field label="Statut publication" hint="Visibilité dans l'Explorer">
          <Select
            value={info.status}
            options={STATUS_OPTIONS}
            onChange={(status) => editor.patchModule('generalInfo', { status })}
          />
        </Field>
      </div>

      <div className="grid-2" style={{ marginBottom: 12 }}>
        <Field label="Raison sociale" hint="Personne morale propriétaire">
          <Input
            value={legalName}
            placeholder="SARL …"
            readOnly={!provider?.companyName}
            onChange={() => undefined}
          />
        </Field>
        <Field label="ID OTI" hint="Identifiant canonique, généré, non modifiable">
          <Input value={refShort} mono readOnly onChange={() => undefined} />
        </Field>
      </div>

      <div className="grid-1-2" style={{ marginBottom: 12 }}>
        <Field label="Type d'objet (famille)" required hint="Famille canonique — détermine les sections obligatoires">
          <div className="input-wrap">
            <span className="prefix">●</span>
            <Input value={typeLabel} mono readOnly prefix="●" onChange={() => undefined} />
          </div>
        </Field>
        <Field label="Sous-catégorie métier (taxonomy)" hint="object_taxonomy hiérarchique">
          <div className="input-wrap">
            <Input
              value={taxoPath}
              placeholder="Taper pour chercher dans la taxonomie…"
              readOnly
              suffix="▾"
              onChange={() => undefined}
            />
          </div>
        </Field>
      </div>

      <Field
        label="Familles secondaires"
        hint="Cas multi-appartenance rares (ex : ITI + LOI). Ne stocke jamais un sous-type métier."
      >
        <ChipSet>
          <Chip label={archetype ?? 'Principal'} on />
          <Chip label="+ Ajouter une seconde famille" />
        </ChipSet>
      </Field>
    </Fs>
  );
}
