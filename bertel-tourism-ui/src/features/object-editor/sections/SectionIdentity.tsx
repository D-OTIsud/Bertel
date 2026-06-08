import { useEffect, useState } from 'react';
import { Fs, Field, Input, Readout, EditorModal } from '../primitives';
import type { SectionProps } from './section-types';
import type {
  ObjectWorkspaceTaxonomyAssignment,
  ObjectWorkspaceTaxonomyDomain,
  ObjectWorkspaceTaxonomyNodeOption,
  ObjectWorkspaceTaxonomyPathNode,
} from '../../../services/object-workspace-parser';
import { ARCHETYPE_META, TYPE_LABEL } from '../archetypes';

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

/** Diacritic-insensitive lowercasing for search matching. */
function foldText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/**
 * Node ids to keep visible for a search query: every label match, plus its
 * ancestors (so the path stays readable) and its descendants (so a matched
 * branch shows its options). Returns null when the query is empty (show all).
 */
function computeSearchVisibleIds(
  nodes: ObjectWorkspaceTaxonomyNodeOption[],
  nodeById: Map<string, ObjectWorkspaceTaxonomyNodeOption>,
  childrenByParentId: Map<string | null, ObjectWorkspaceTaxonomyNodeOption[]>,
  foldedQuery: string,
): Set<string> | null {
  if (!foldedQuery) {
    return null;
  }
  const visible = new Set<string>();
  function addDescendants(id: string) {
    for (const child of childrenByParentId.get(id) ?? []) {
      visible.add(child.id);
      addDescendants(child.id);
    }
  }
  for (const node of nodes) {
    if (!foldText(node.label).includes(foldedQuery)) {
      continue;
    }
    visible.add(node.id);
    let current: ObjectWorkspaceTaxonomyNodeOption | undefined = node;
    while (current?.parentId) {
      visible.add(current.parentId);
      current = nodeById.get(current.parentId);
    }
    addDescendants(node.id);
  }
  return visible;
}

/**
 * Sub-category selector — single readable column with search (redesign 2026-06-08,
 * from a user mockup; replaces the multi-column cascade). A compact breadcrumb of
 * the live selection sits on top, then a search box, then a single-column tree where
 * parent groups expand/collapse and assignable leaves are radio options. The saved
 * choice is badged "Actuelle"; "Valider la sélection" only enables on a changed
 * assignable node and persists via the `taxonomy` module.
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
  const assignment = domain?.assignment ?? null;
  const nodes = domain?.nodes ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParentId = groupTaxonomyChildren(nodes);
  const roots = childrenByParentId.get(null) ?? [];
  const hasSelectableNodes = nodes.some((node) => node.isAssignable);

  const [selectedId, setSelectedId] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  // On open, preselect the saved assignment and expand the branch leading to it.
  useEffect(() => {
    if (!open) {
      return;
    }
    const domainNodes = domain?.nodes ?? [];
    const assignedNode = domainNodes.find((node) => node.id === domain?.assignment?.nodeId) ?? null;
    const ancestorIds = assignedNode
      ? buildTaxonomyPath(domainNodes, assignedNode).slice(0, -1).map((node) => node.id)
      : [];
    setSelectedId(domain?.assignment?.nodeId ?? '');
    setExpandedIds(new Set(ancestorIds));
    setQuery('');
  }, [domain?.assignment?.nodeId, domain?.domain, open]);

  const selectedNode = nodeById.get(selectedId) ?? null;
  const hasSelectionChanged = Boolean(
    selectedNode && selectedNode.isAssignable && selectedNode.id !== assignment?.nodeId,
  );
  // Live breadcrumb — the selected path, falling back to the saved assignment path.
  const selectedPath = selectedNode
    ? collapseTaxonomyPath(buildTaxonomyPath(nodes, selectedNode))
    : collapseTaxonomyPath(assignment?.path ?? []);

  const foldedQuery = foldText(query);
  const visibleIds = computeSearchVisibleIds(nodes, nodeById, childrenByParentId, foldedQuery);
  const isVisible = (id: string) => !visibleIds || visibleIds.has(id);
  const isExpanded = (id: string) => (foldedQuery ? true : expandedIds.has(id));

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSave() {
    if (!domain || !selectedNode || !hasSelectionChanged) {
      return;
    }
    onApply(buildTaxonomyAssignment(domain, selectedNode));
    onClose();
  }

  function renderNode(node: ObjectWorkspaceTaxonomyNodeOption, depth: number) {
    if (!isVisible(node.id)) {
      return null;
    }
    const children = childrenByParentId.get(node.id) ?? [];
    const hasChildren = children.length > 0;
    const expanded = isExpanded(node.id);
    const isSelected = node.id === selectedId;
    const isCurrent = node.id === assignment?.nodeId;
    return (
      <li key={node.id}>
        <div
          className={`taxo2-row${isSelected ? ' is-selected' : ''}`}
          style={{ paddingLeft: 10 + depth * 18 }}
        >
          {node.isAssignable ? (
            <label className="taxo2-opt">
              <input
                type="radio"
                name="taxo2-choice"
                className="taxo2-radio"
                checked={isSelected}
                onChange={() => setSelectedId(node.id)}
              />
              <span className="taxo2-label">{node.label}</span>
              {isCurrent && <span className="taxo2-badge">Actuelle</span>}
            </label>
          ) : (
            <button
              type="button"
              className="taxo2-group"
              aria-expanded={hasChildren ? expanded : undefined}
              onClick={() => hasChildren && toggleExpand(node.id)}
            >
              <span className="taxo2-label">{node.label}</span>
              {isCurrent && <span className="taxo2-badge">Actuelle</span>}
            </button>
          )}
          {hasChildren && (
            <button
              type="button"
              className={`taxo2-caret${expanded ? ' is-open' : ''}`}
              aria-label={expanded ? `Réduire ${node.label}` : `Développer ${node.label}`}
              aria-expanded={expanded}
              onClick={() => toggleExpand(node.id)}
            >
              <span aria-hidden="true">›</span>
            </button>
          )}
        </div>
        {hasChildren && expanded && (
          <ul className="taxo2-children">{children.map((child) => renderNode(child, depth + 1))}</ul>
        )}
      </li>
    );
  }

  return (
    <EditorModal
      open={open}
      title="Choisir une sous-catégorie"
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Valider la sélection"
      saveDisabled={!hasSelectionChanged}
    >
      <div className="object-editor taxo2">
        {!domain ? (
          <p className="identity-taxo__notice">
            Aucune sous-catégorie n'est définie pour ce type de fiche.
          </p>
        ) : (
          <>
            <div className="taxo2-path">
              <span className="taxo2-path__label">Sélection</span>
              {selectedPath.length > 0 ? (
                <TaxonomyCrumbs path={selectedPath} />
              ) : (
                <em className="identity-taxo__none">Aucune sous-catégorie sélectionnée</em>
              )}
            </div>

            {hasSelectableNodes ? (
              <>
                <div className="taxo2-search">
                  <span className="taxo2-search__icon" aria-hidden="true">⌕</span>
                  <input
                    type="text"
                    className="taxo2-search__input"
                    placeholder="Rechercher une sous-catégorie…"
                    aria-label="Rechercher une sous-catégorie"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <ul className="taxo2-tree">{roots.map((root) => renderNode(root, 0))}</ul>
                {Boolean(foldedQuery) && (visibleIds?.size ?? 0) === 0 && (
                  <p className="taxo2-empty">Aucune sous-catégorie ne correspond à votre recherche.</p>
                )}
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

/** Section 01 — commercial name, object type and sub-category (design: edit-primitives).
 *  Publication status moved to the editor rail; legal name is edited in §18 Fournisseur. */
export function SectionIdentity({ editor, objectId, typeCode, archetype, folded }: SectionProps) {
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const info = editor.draft.generalInfo;
  const taxonomy = editor.draft.taxonomy;
  const meta = archetype ? ARCHETYPE_META[archetype] : null;
  const canonicalType = typeCode?.toUpperCase() ?? '';
  const typeFamilyLabel = TYPE_LABEL[canonicalType] ?? meta?.codeName ?? canonicalType;
  const typeDisplay = canonicalType ? `${canonicalType} — ${typeFamilyLabel}` : meta?.codeName ?? '';
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
      title="Identité & catégorie"
      sub="Nom commercial, type principal, sous-catégorie"
      folded={folded}
      pill={{ tone: 'ok', label: 'OK' }}
    >
      <div className="grid-2-1" style={{ marginBottom: 12 }}>
        <Field label="Nom commercial" required>
          <Input value={info.name} onChange={(name) => editor.patchModule('generalInfo', { name })} lg />
        </Field>
        <Field label="ID OTI" hint="Identifiant canonique, généré, non modifiable">
          <Readout value={canonicalId} mono />
        </Field>
      </div>

      <div className="grid-1-2" style={{ marginBottom: 12 }}>
        <Field label="Type d'objet (famille)" required hint="Famille canonique — détermine les sections obligatoires">
          <Readout value={typeDisplay} mono prefix="●" />
        </Field>
        <Field label="Sous-catégorie" hint="Positionnement précis dans la famille métier">
          <button
            type="button"
            className="identity-taxo-trigger"
            aria-label={
              taxonomyPath
                ? `Modifier la sous-catégorie (actuelle : ${taxonomyPath})`
                : 'Modifier la sous-catégorie'
            }
            onClick={() => setTaxonomyOpen(true)}
          >
            <span className={`identity-taxo-trigger__value${taxonomyPath ? '' : ' is-empty'}`}>
              {taxonomyPath || 'Définir la sous-catégorie…'}
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
