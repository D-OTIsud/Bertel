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

function normalizeTaxonomyLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.length > 3 ? part.replace(/s$/, '') : part)
    .join(' ');
}

function hasSameTaxonomyMeaning(left: string, right: string): boolean {
  const normalizedLeft = normalizeTaxonomyLabel(left);
  const normalizedRight = normalizeTaxonomyLabel(right);
  return Boolean(normalizedLeft && normalizedLeft === normalizedRight);
}

function collapseTaxonomyPath(path: ObjectWorkspaceTaxonomyPathNode[]): ObjectWorkspaceTaxonomyPathNode[] {
  return path.filter((node, index) => (
    index === 0 || !hasSameTaxonomyMeaning(path[index - 1].label, node.label)
  ));
}

function formatTaxonomyPath(assignment: ObjectWorkspaceTaxonomyAssignment | null | undefined): string {
  if (!assignment) {
    return '';
  }

  return collapseTaxonomyPath(assignment.path).map((node) => node.label).join(' ▸ ');
}

function sortTaxonomyNodes(
  nodes: ObjectWorkspaceTaxonomyNodeOption[],
): ObjectWorkspaceTaxonomyNodeOption[] {
  return [...nodes].sort((left, right) => (
    left.position - right.position
    || left.label.localeCompare(right.label, 'fr')
    || left.code.localeCompare(right.code, 'fr')
  ));
}

/** Group nodes by parent id (roots under `null`); each sibling list is sorted. */
function groupTaxonomyChildren(
  nodes: ObjectWorkspaceTaxonomyNodeOption[],
): Map<string | null, ObjectWorkspaceTaxonomyNodeOption[]> {
  const childrenByParentId = new Map<string | null, ObjectWorkspaceTaxonomyNodeOption[]>();
  for (const node of nodes) {
    const siblings = childrenByParentId.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParentId.set(node.parentId, siblings);
  }
  for (const [parentId, children] of childrenByParentId) {
    childrenByParentId.set(parentId, sortTaxonomyNodes(children));
  }
  return childrenByParentId;
}

/** Render one collapsed breadcrumb path (current value / live selection preview). */
function TaxonomyCrumbs({ path }: { path: ObjectWorkspaceTaxonomyPathNode[] }) {
  return (
    <span className="identity-taxo__crumbs">
      {path.map((node, index) => (
        <span key={node.id} className="identity-taxo__crumb">
          {index > 0 && <span className="identity-taxo__sep" aria-hidden="true">▸</span>}
          <span className="identity-taxo__crumb-label">{node.label}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * Editable taxonomy selector — cascading column drill-down.
 * Column 1 holds the root categories; clicking a node opens the next column with
 * its children. The live path preview updates on each click and "Valider" only
 * enables on an assignable node that differs from the saved assignment.
 */
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
  // Node ids from a root down to the deepest drilled node.
  const [activePath, setActivePath] = useState<string[]>([]);
  const assignment = domain?.assignment ?? null;
  const nodes = domain?.nodes ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParentId = groupTaxonomyChildren(nodes);
  const hasSelectableNodes = nodes.some((node) => node.isAssignable);

  // On open, expand the cascade down to the saved assignment.
  useEffect(() => {
    if (!open) {
      return;
    }

    const domainNodes = domain?.nodes ?? [];
    const assignedNode = domainNodes.find((node) => node.id === domain?.assignment?.nodeId) ?? null;
    setActivePath(assignedNode ? buildTaxonomyPath(domainNodes, assignedNode).map((node) => node.id) : []);
  }, [domain?.assignment?.nodeId, domain?.domain, open]);

  // Columns: roots, then the children of each drilled node, stopping at a leaf.
  const columns: ObjectWorkspaceTaxonomyNodeOption[][] = [];
  const roots = childrenByParentId.get(null) ?? [];
  if (roots.length > 0) {
    columns.push(roots);
  }
  for (const id of activePath) {
    const children = childrenByParentId.get(id) ?? [];
    if (children.length === 0) {
      break;
    }
    columns.push(children);
  }

  const selectedId = activePath[activePath.length - 1] ?? '';
  const selectedNode = nodeById.get(selectedId) ?? null;
  const hasSelectionChanged = Boolean(
    selectedNode && selectedNode.isAssignable && selectedNode.id !== assignment?.nodeId,
  );
  const currentPath = collapseTaxonomyPath(assignment?.path ?? []);
  const previewPath = collapseTaxonomyPath(
    activePath
      .map((id) => nodeById.get(id))
      .filter((node): node is ObjectWorkspaceTaxonomyNodeOption => Boolean(node))
      .map((node, index) => toTaxonomyPathNode(node, index)),
  );

  function handleSelect(node: ObjectWorkspaceTaxonomyNodeOption) {
    setActivePath(buildTaxonomyPath(nodes, node).map((pathNode) => pathNode.id));
  }

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
                <TaxonomyCrumbs path={currentPath} />
              ) : (
                <em className="identity-taxo__none">Aucune sous-catégorie assignée</em>
              )}
            </div>

            {hasSelectableNodes ? (
              <>
                <div className="identity-taxo__preview">
                  <span className="identity-taxo__field-label">Sélection en cours</span>
                  {previewPath.length > 0 ? (
                    <TaxonomyCrumbs path={previewPath} />
                  ) : (
                    <em className="identity-taxo__none">
                      Choisissez une catégorie dans la première colonne.
                    </em>
                  )}
                </div>

                <div className="identity-taxo__cascade">
                  {columns.map((column, columnIndex) => (
                    <ul key={columnIndex} className="identity-taxo__col">
                      {column.map((node) => {
                        const onActivePath = activePath.includes(node.id);
                        const isSelected = node.id === selectedId;
                        const isCurrent = node.id === assignment?.nodeId;
                        const hasChildren = (childrenByParentId.get(node.id)?.length ?? 0) > 0;
                        return (
                          <li key={node.id}>
                            <button
                              type="button"
                              className={[
                                'identity-taxo__cell',
                                node.isAssignable ? 'is-option' : 'is-group',
                                onActivePath ? 'is-active' : '',
                                isSelected ? 'is-selected' : '',
                              ].filter(Boolean).join(' ')}
                              aria-pressed={onActivePath}
                              onClick={() => handleSelect(node)}
                            >
                              <span className="identity-taxo__cell-label">{node.label}</span>
                              {isCurrent && <span className="identity-taxo__cell-tag">Actuel</span>}
                              {hasChildren && (
                                <span className="identity-taxo__cell-caret" aria-hidden="true">›</span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ))}
                </div>
              </>
            ) : (
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
  const taxonomyPath = formatTaxonomyPath(taxonomyDomain?.assignment);
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
