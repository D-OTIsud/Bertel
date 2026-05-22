import { useEffect, useState } from 'react';
import { Fs, Field, Input, Select, EditorModal } from '../primitives';
import type { SectionProps } from './section-types';
import type {
  ObjectWorkspaceTaxonomyAssignment,
  ObjectWorkspaceTaxonomyDomain,
  ObjectWorkspaceTaxonomyNodeOption,
  ObjectWorkspaceTaxonomyPathNode,
} from '../../../services/object-workspace-parser';
import { ARCHETYPE_META, TYPE_LABEL } from '../archetypes';

const STATUS_OPTIONS = [
  { v: 'published', l: 'Publié — en ligne' },
  { v: 'draft', l: 'Brouillon' },
  { v: 'hidden', l: 'Hors ligne' },
  { v: 'archived', l: 'Archivé' },
];

function toTaxonomyPathNode(
  node: ObjectWorkspaceTaxonomyNodeOption,
  depth: number,
): ObjectWorkspaceTaxonomyPathNode {
  return {
    id: node.id,
    code: node.code,
    label: node.label,
    description: node.description,
    depth,
  };
}

function buildTaxonomyPath(
  nodes: ObjectWorkspaceTaxonomyNodeOption[],
  selectedNode: ObjectWorkspaceTaxonomyNodeOption,
): ObjectWorkspaceTaxonomyPathNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const reversed: ObjectWorkspaceTaxonomyNodeOption[] = [];
  const visited = new Set<string>();
  let current: ObjectWorkspaceTaxonomyNodeOption | null = selectedNode;

  while (current && !visited.has(current.id)) {
    reversed.push(current);
    visited.add(current.id);
    current = current.parentId ? (nodeById.get(current.parentId) ?? null) : null;
  }

  return reversed.reverse().map((node, index) => toTaxonomyPathNode(node, index));
}

function buildTaxonomyAssignment(
  domain: ObjectWorkspaceTaxonomyDomain,
  selectedNode: ObjectWorkspaceTaxonomyNodeOption,
): ObjectWorkspaceTaxonomyAssignment {
  const path = buildTaxonomyPath(domain.nodes, selectedNode);
  return {
    recordId: domain.assignment?.recordId ?? null,
    nodeId: selectedNode.id,
    code: selectedNode.code,
    label: selectedNode.label,
    description: selectedNode.description,
    depth: Math.max(0, path.length - 1),
    path,
    updatedAt: domain.assignment?.updatedAt ?? '',
    source: 'workspace_taxonomy',
  };
}

/** Editable taxonomy selector. */
function TaxonomyModal({
  open,
  domain,
  onClose,
  onApply,
}: {
  open: boolean;
  domain: ObjectWorkspaceTaxonomyDomain | null;
  onClose: () => void;
  onApply: (assignment: ObjectWorkspaceTaxonomyAssignment) => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const assignment = domain?.assignment ?? null;
  const assignableNodes = (domain?.nodes ?? []).filter((node) => node.isAssignable);
  const selectedNode = assignableNodes.find((node) => node.id === selectedNodeId) ?? null;
  const hasSelectionChanged = Boolean(selectedNode && selectedNode.id !== assignment?.nodeId);
  const query = search.trim().toLowerCase();
  const filteredNodes = query
    ? assignableNodes.filter((node) => `${node.code} ${node.label}`.toLowerCase().includes(query))
    : assignableNodes;

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearch('');
    setSelectedNodeId(domain?.assignment?.nodeId ?? '');
  }, [domain?.assignment?.nodeId, domain?.domain, open]);

  function handleSave() {
    if (!domain || !selectedNode || !hasSelectionChanged) {
      return;
    }

    onApply(buildTaxonomyAssignment(domain, selectedNode));
    onClose();
  }

  return (
    <EditorModal
      open={open}
      title="Sous-catégorie métier"
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Valider"
      saveDisabled={!hasSelectionChanged}
    >
      <div className="object-editor identity-taxo">
        {!domain ? (
          <p className="identity-taxo__notice">
            Aucune sous-catégorie n'est définie pour ce type de fiche.
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
                  placeholder="Rechercher une sous-catégorie…"
                  value={search}
                  aria-label="Rechercher dans la taxonomie"
                  onChange={(event) => setSearch(event.target.value)}
                />
                {filteredNodes.length > 0 ? (
                  <ul className="identity-taxo__list">
                    {filteredNodes.map((node) => (
                      <li
                        key={node.id}
                        className={[
                          'identity-taxo__node',
                          node.id === assignment?.nodeId ? 'is-current' : '',
                          node.id === selectedNodeId ? 'is-selected' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <button
                          type="button"
                          className="identity-taxo__node-button"
                          style={{ paddingLeft: 10 + node.depth * 16 }}
                          aria-pressed={node.id === selectedNodeId}
                          onClick={() => setSelectedNodeId(node.id)}
                        >
                          <span>{node.label}</span>
                          {node.id === assignment?.nodeId && (
                            <span className="identity-taxo__node-tag">Actuel</span>
                          )}
                          {node.id === selectedNodeId && node.id !== assignment?.nodeId && (
                            <span className="identity-taxo__node-tag">Sélectionné</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="identity-taxo__notice">Aucune sous-catégorie ne correspond à cette recherche.</p>
                )}
              </>
            )}

            {assignableNodes.length === 0 && (
              <p className="identity-taxo__notice">
                Les options de sous-catégorie ne sont pas disponibles pour ce type de fiche.
                La valeur actuelle reste affichée en lecture seule.
              </p>
            )}
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
  const legalName = editor.draft.provider?.companyName || '';
  const canonicalId = objectId ?? '';
  const taxonomyDomain = taxonomy.domains[0] ?? null;
  const taxonomyPath = taxonomyDomain?.assignment?.path.map((node) => node.label).join(' ▸ ') ?? '';
  function applyTaxonomyAssignment(assignment: ObjectWorkspaceTaxonomyAssignment) {
    if (!taxonomyDomain) {
      return;
    }

    editor.replaceModule('taxonomy', {
      ...taxonomy,
      domains: taxonomy.domains.map((domain) => (
        domain.domain === taxonomyDomain.domain ? { ...domain, assignment } : domain
      )),
    });
  }

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
          hint="Nom légal associé à la fiche"
        >
          <Input value={legalName} placeholder="Non renseignée" readOnly onChange={() => undefined} />
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
        <Field label="Sous-catégorie métier" hint="Positionnement précis dans la famille métier">
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

      <TaxonomyModal
        open={taxonomyOpen}
        domain={taxonomyDomain}
        onClose={() => setTaxonomyOpen(false)}
        onApply={applyTaxonomyAssignment}
      />
    </Fs>
  );
}
