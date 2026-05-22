import { useState } from 'react';
import { Fs, Field, Input, Select, Chip, ChipSet, EditorModal } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceTaxonomyDomain } from '../../../services/object-workspace-parser';
import { ARCHETYPE_META, TYPE_LABEL } from '../archetypes';

const STATUS_OPTIONS = [
  { v: 'published', l: 'Publié — en ligne' },
  { v: 'draft', l: 'Brouillon' },
  { v: 'hidden', l: 'Hors ligne' },
  { v: 'archived', l: 'Archivé' },
];

/** "RES" -> "RES — Restaurant"; an unknown code falls back to the bare uppercase code. */
function secondaryFamilyLabel(code: string): string {
  const upper = code.trim().toUpperCase();
  const label = TYPE_LABEL[upper];
  return label ? `${upper} — ${label}` : upper;
}

/**
 * Read-only structured viewer for object_taxonomy.
 *
 * The "Valider" action is permanently disabled: taxonomy node options are not
 * exposed by the workspace payload (REST enrichment is gated off) and
 * useEditorSave.buildSaveArg() carries no object_taxonomy write — a taxonomy
 * edit would never persist. The modal therefore shows the current assignment
 * (domain + hierarchical path) and never offers a fake save.
 */
function TaxonomyModal({
  open,
  domain,
  onClose,
}: {
  open: boolean;
  domain: ObjectWorkspaceTaxonomyDomain | null;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const assignment = domain?.assignment ?? null;
  const assignableNodes = (domain?.nodes ?? []).filter((node) => node.isAssignable);
  const query = search.trim().toLowerCase();
  const filteredNodes = query
    ? assignableNodes.filter((node) => `${node.code} ${node.label}`.toLowerCase().includes(query))
    : assignableNodes;

  return (
    <EditorModal
      open={open}
      title="Sous-catégorie métier"
      onClose={onClose}
      onSave={onClose}
      saveLabel="Valider"
      saveDisabled
    >
      <div className="object-editor identity-taxo">
        {!domain ? (
          <p className="identity-taxo__notice">
            Aucun domaine de taxonomie n'est défini pour ce type d'objet.
          </p>
        ) : (
          <>
            <div className="identity-taxo__domain">
              <span className="identity-taxo__field-label">Domaine</span>
              <strong>{domain.label}</strong>
            </div>

            <div className="identity-taxo__path">
              <span className="identity-taxo__field-label">Sous-catégorie actuelle</span>
              {assignment ? (
                <span className="identity-taxo__crumbs">
                  {assignment.path.map((node, index) => (
                    <span key={node.id} className="identity-taxo__crumb">
                      {index > 0 && (
                        <span className="identity-taxo__sep" aria-hidden="true">▸</span>
                      )}
                      <span className="identity-taxo__crumb-label">{node.label}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <em className="identity-taxo__none">Aucune sous-catégorie assignée</em>
              )}
            </div>

            {assignableNodes.length > 0 && (
              <>
                <input
                  type="search"
                  className="input"
                  placeholder="Rechercher un nœud…"
                  value={search}
                  aria-label="Rechercher dans la taxonomie"
                  onChange={(event) => setSearch(event.target.value)}
                />
                <ul className="identity-taxo__list">
                  {filteredNodes.map((node) => (
                    <li
                      key={node.id}
                      className={`identity-taxo__node${node.id === assignment?.nodeId ? ' is-current' : ''}`}
                      style={{ paddingLeft: 10 + node.depth * 16 }}
                    >
                      {node.label}
                      {node.id === assignment?.nodeId && (
                        <span className="identity-taxo__node-tag">Actuel</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="identity-taxo__notice">
              L'édition de la sous-catégorie métier n'est pas encore disponible : l'API
              n'expose pas les nœuds assignables et aucun chemin de sauvegarde object_taxonomy
              n'est branché. La valeur ci-dessus est affichée en lecture seule.
            </p>
          </>
        )}
      </div>
    </EditorModal>
  );
}

/** Section 01 — commercial name, publication status, and taxonomy (design: edit-primitives). */
export function SectionIdentity({ editor, objectId, typeCode, archetype, folded }: SectionProps) {
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const info = editor.draft.generalInfo;
  const taxonomy = editor.draft.taxonomy;
  const meta = archetype ? ARCHETYPE_META[archetype] : null;
  const canonicalType = typeCode?.toUpperCase() ?? '';
  const typeFamilyLabel = TYPE_LABEL[canonicalType] ?? meta?.codeName ?? canonicalType;
  const typeDisplay = canonicalType ? `${canonicalType} — ${typeFamilyLabel}` : meta?.codeName ?? '';
  // Raison sociale comes from object_legal (type raison_sociale) via the parser —
  // never from actor.display_name. Read-only here; edited through the Légal module.
  const legalName = editor.draft.provider?.companyName || '';
  const canonicalId = objectId ?? '';
  const taxonomyDomain = taxonomy.domains[0] ?? null;
  const taxonomyPath = taxonomyDomain?.assignment?.path.map((node) => node.label).join(' ▸ ') ?? '';
  // object.secondary_types — transitory opt-in multi-family flag, not the taxonomy.
  const secondaryTypes = info.secondaryTypes ?? [];

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
          <div className="identity-status">
            <span
              className={`identity-status__dot identity-status__dot--${info.status}`}
              aria-hidden="true"
            />
            <Select
              value={info.status}
              options={STATUS_OPTIONS}
              onChange={(status) => editor.patchModule('generalInfo', { status })}
            />
          </div>
        </Field>
      </div>

      <div className="grid-2" style={{ marginBottom: 12 }}>
        <Field
          label="Raison sociale"
          hint="Entité juridique — jamais le nom de l'acteur opérateur."
        >
          <Input value={legalName} placeholder="Non renseignée" readOnly onChange={() => undefined} />
          <p className="identity-help">
            Stockée dans object_legal (type raison_sociale). Modification via le module Légal.
          </p>
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
        <Field label="Sous-catégorie métier" hint="object_taxonomy hiérarchique — un seul nœud par domaine">
          <button
            type="button"
            className="identity-taxo-trigger"
            aria-label={
              taxonomyPath
                ? `Modifier la sous-catégorie métier (actuelle : ${taxonomyPath})`
                : 'Modifier la sous-catégorie métier'
            }
            onClick={() => setTaxonomyOpen(true)}
          >
            <span className={`identity-taxo-trigger__value${taxonomyPath ? '' : ' is-empty'}`}>
              {taxonomyPath || 'Définir la sous-catégorie métier…'}
            </span>
            <span className="identity-taxo-trigger__caret" aria-hidden="true">▾</span>
          </button>
        </Field>
      </div>

      <Field
        label="Familles secondaires, multi-appartenance rare"
        hint="N'est pas la sous-catégorie métier — réservé à une réelle seconde grande famille."
      >
        <p className="identity-help">
          À utiliser seulement si l'objet appartient réellement à une autre grande famille
          métier. Ne remplace pas la sous-catégorie métier.
        </p>
        {secondaryTypes.length === 0 ? (
          <p className="identity-secondary__empty">Aucune famille secondaire</p>
        ) : (
          <ChipSet>
            {secondaryTypes.map((code) => (
              <Chip key={code} label={secondaryFamilyLabel(code)} />
            ))}
          </ChipSet>
        )}
        <div className="identity-secondary__add">
          <Chip label="+ Ajouter une seconde famille" />
          <span className="identity-help">
            Ajout différé — le contrat de sauvegarde de object.secondary_types n'est pas encore branché.
          </span>
        </div>
      </Field>

      <TaxonomyModal
        open={taxonomyOpen}
        domain={taxonomyDomain}
        onClose={() => setTaxonomyOpen(false)}
      />
    </Fs>
  );
}
