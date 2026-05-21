import { Fs, Field, Input, Select, Chip, ChipSet } from '../primitives';
import type { SectionProps } from './section-types';
import { ARCHETYPE_META, TYPE_LABEL } from '../archetypes';

const STATUS_OPTIONS = [
  { v: 'published', l: '🟢 Publié — en ligne' },
  { v: 'draft', l: '🟡 Brouillon' },
  { v: 'hidden', l: '🔴 Hors ligne' },
  { v: 'archived', l: '⚫ Archivé' },
];

/** Section 01 — commercial name, publication status, and taxonomy (design: edit-primitives). */
export function SectionIdentity({ editor, objectId, typeCode, archetype, folded }: SectionProps) {
  const info = editor.draft.generalInfo;
  const taxonomy = editor.draft.taxonomy;
  const provider = editor.draft.provider;
  const meta = archetype ? ARCHETYPE_META[archetype] : null;
  const canonicalType = typeCode?.toUpperCase() ?? '';
  const typeFamilyLabel = TYPE_LABEL[canonicalType] ?? meta?.codeName ?? canonicalType;
  const typeDisplay = canonicalType ? `${canonicalType} — ${typeFamilyLabel}` : meta?.codeName ?? '';
  const legalName = provider?.companyName || '';
  const canonicalId = objectId ?? '';
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
        <Field
          label="Raison sociale"
          hint="object_legal · type raison_sociale (vide si non renseigné — pas le nom de l'acteur opérateur)"
        >
          <Input
            value={legalName}
            placeholder="SARL …"
            readOnly
            onChange={() => undefined}
          />
        </Field>
        <Field label="ID OTI" hint="Identifiant canonique, généré, non modifiable">
          <Input value={canonicalId} mono readOnly onChange={() => undefined} />
        </Field>
      </div>

      <div className="grid-1-2" style={{ marginBottom: 12 }}>
        <Field label="Type d'objet (famille)" required hint="Famille canonique — détermine les sections obligatoires">
          <div className="input-wrap">
            <span className="prefix">●</span>
            <Input value={typeDisplay} mono readOnly prefix="●" onChange={() => undefined} />
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
