import { Fs, Field, Input, Select } from '../primitives';
import type { SectionProps } from './section-types';

const STATUS_OPTIONS = [
  { v: 'draft', l: 'Brouillon' },
  { v: 'published', l: 'Publié' },
  { v: 'archived', l: 'Archivé' },
  { v: 'hidden', l: 'Masqué' },
];

/** Section 01 — commercial name, publication status, and the (read-only) taxonomy path. */
export function SectionIdentity({ editor }: SectionProps) {
  const info = editor.draft.generalInfo;
  const taxonomy = editor.draft.taxonomy;

  return (
    <Fs num="01" title="Identité & taxonomie" sub="Nom commercial, statut, taxonomie métier">
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
