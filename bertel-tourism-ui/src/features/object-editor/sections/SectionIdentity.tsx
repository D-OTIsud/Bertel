import { Fs, Field, Input, Select } from '../primitives';
import type { SectionProps } from './section-types';
import { Provenance, type ProvenanceSource } from '../widgets/Provenance';

const STATUS_OPTIONS = [
  { v: 'draft', l: 'Brouillon' },
  { v: 'published', l: 'Publié' },
  { v: 'archived', l: 'Archivé' },
  { v: 'hidden', l: 'Masqué' },
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
  if (!sync) {
    return null;
  }

  const origin = sync.origins[0];
  if (origin) {
    return {
      source: resolveSource(origin.sourceSystem),
      who: origin.sourceObjectId || origin.importBatchId,
      when: origin.updatedAt || origin.createdAt || origin.firstImportedAt,
    };
  }

  const external = sync.externalIdentifiers[0];
  if (external) {
    return {
      source: resolveSource(external.sourceSystem),
      who: external.externalId,
      when: external.lastSyncedAt || external.updatedAt || external.createdAt,
    };
  }

  return null;
}

/** Section 01 — commercial name, publication status, and the (read-only) taxonomy path. */
export function SectionIdentity({ editor, folded }: SectionProps) {
  const info = editor.draft.generalInfo;
  const taxonomy = editor.draft.taxonomy;
  const provenance = importProvenance(editor.draft.syncIdentifiers);

  return (
    <Fs num="01" title="Identité & taxonomie" sub="Nom commercial, statut, taxonomie métier" folded={folded}>
      {provenance && <Provenance {...provenance} />}
      <div className="grid-2">
        <Field label="Nom commercial" required>
          <Input value={info.name} onChange={(name) => editor.patchModule('generalInfo', { name })} lg />
        </Field>
        <Field label="Statut de publication">
          <Select
            value={info.status}
            options={STATUS_OPTIONS}
            onChange={(status) => editor.patchModule('generalInfo', { status })}
          />
        </Field>
      </div>

      <div className="chip-group__label">Taxonomie métier</div>
      {taxonomy.domains.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>Aucun domaine de taxonomie pour ce type.</p>
      ) : (
        taxonomy.domains.map((domain) => (
          <Field key={domain.domain} label={domain.label} hint="Édition de la taxonomie à venir">
            <Input
              value={domain.assignment ? domain.assignment.path.map((node) => node.label).join(' ▸ ') : ''}
              onChange={() => undefined}
              placeholder="Non assigné"
              readOnly
            />
          </Field>
        ))
      )}
    </Fs>
  );
}
