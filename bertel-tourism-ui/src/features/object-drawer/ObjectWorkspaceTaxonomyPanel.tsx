import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceTaxonomyAssignment,
  ObjectWorkspaceTaxonomyDomain,
  ObjectWorkspaceTaxonomyModule,
  ObjectWorkspaceTaxonomyNodeOption,
  ObjectWorkspaceTaxonomyPathNode,
} from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceTaxonomyPanelProps {
  value: ObjectWorkspaceTaxonomyModule;
  objectType?: string;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceTaxonomyModule) => void;
  onSave: () => void;
}

interface ObjectWorkspaceTaxonomyFieldsProps {
  value: ObjectWorkspaceTaxonomyModule;
  objectType?: string;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceTaxonomyModule) => void;
}

interface TaxonomyTreeNode extends ObjectWorkspaceTaxonomyNodeOption {
  children: TaxonomyTreeNode[];
}

function buildTaxonomyTree(nodes: ObjectWorkspaceTaxonomyNodeOption[]): TaxonomyTreeNode[] {
  const nodesByCode = new Map<string, TaxonomyTreeNode>();
  const roots: TaxonomyTreeNode[] = [];

  for (const node of nodes) {
    nodesByCode.set(node.code, {
      ...node,
      children: [],
    });
  }

  for (const node of nodesByCode.values()) {
    if (node.parentCode) {
      const parent = nodesByCode.get(node.parentCode);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }

    roots.push(node);
  }

  const sortNodes = (items: TaxonomyTreeNode[]) => {
    items.sort((left, right) => left.position - right.position || left.label.localeCompare(right.label, 'fr'));
    for (const item of items) {
      sortNodes(item.children);
    }
  };

  sortNodes(roots);
  return roots;
}

function buildPathFromNodes(domain: ObjectWorkspaceTaxonomyDomain, node: ObjectWorkspaceTaxonomyNodeOption): ObjectWorkspaceTaxonomyPathNode[] {
  const nodeById = new Map(domain.nodes.map((candidate) => [candidate.id, candidate]));
  const path: ObjectWorkspaceTaxonomyPathNode[] = [];
  let cursor: ObjectWorkspaceTaxonomyNodeOption | undefined = node;

  while (cursor) {
    path.push({
      id: cursor.id,
      code: cursor.code,
      label: cursor.label,
      description: cursor.description,
      depth: 0,
    });
    cursor = cursor.parentId ? nodeById.get(cursor.parentId) : undefined;
  }

  return path.reverse().map((pathNode, index) => ({
    ...pathNode,
    depth: index,
  }));
}

function updateDomainAssignment(
  module: ObjectWorkspaceTaxonomyModule,
  domainCode: string,
  nextAssignment: ObjectWorkspaceTaxonomyAssignment | null,
): ObjectWorkspaceTaxonomyModule {
  return {
    ...module,
    domains: module.domains.map((domain) => (
      domain.domain === domainCode
        ? {
            ...domain,
            assignment: nextAssignment,
          }
        : domain
    )),
  };
}

function shouldShowTaxonomyDomainForType(domain: ObjectWorkspaceTaxonomyDomain, objectType?: string): boolean {
  const normalizedType = String(objectType ?? '').trim().toUpperCase();
  const normalizedDomainType = String(domain.objectType ?? '').trim().toUpperCase();

  if (!normalizedType || !normalizedDomainType) {
    return true;
  }

  return normalizedType === normalizedDomainType || Boolean(domain.assignment);
}

export function getVisibleTaxonomyDomains(
  value: ObjectWorkspaceTaxonomyModule,
  objectType?: string,
): ObjectWorkspaceTaxonomyDomain[] {
  const domains = Array.isArray(value?.domains) ? value.domains : [];
  return domains.filter((domain) => shouldShowTaxonomyDomainForType(domain, objectType));
}

function renderBreadcrumb(assignment: ObjectWorkspaceTaxonomyAssignment | null): string {
  if (!assignment) {
    return 'Aucune sous-categorie selectionnee.';
  }

  const labels = assignment.path.map((item) => item.label).filter(Boolean);
  return labels.length > 0 ? labels.join(' > ') : assignment.label;
}

function nodeMatchesSearch(node: TaxonomyTreeNode, query: string): boolean {
  if (!query) {
    return true;
  }
  if (node.label.toLowerCase().includes(query)) {
    return true;
  }
  return node.children.some((child) => nodeMatchesSearch(child, query));
}

function TaxonomyRows({
  nodes,
  depth,
  query,
  selectedNodeId,
  activeNodeCodes,
  disabled,
  expandedState,
  onToggleExpanded,
  onSelectNode,
}: {
  nodes: TaxonomyTreeNode[];
  depth: number;
  query: string;
  selectedNodeId: string | null;
  activeNodeCodes: Set<string>;
  disabled: boolean;
  expandedState: Record<string, boolean>;
  onToggleExpanded: (nodeCode: string) => void;
  onSelectNode: (node: ObjectWorkspaceTaxonomyNodeOption) => void;
}) {
  return (
    <>
      {nodes
        .filter((node) => nodeMatchesSearch(node, query))
        .map((node) => {
          const hasChildren = node.children.length > 0;
          const isSelected = selectedNodeId === node.id;
          const isExpanded = query
            ? true
            : expandedState[node.code] ?? (activeNodeCodes.has(node.code) || depth < 1);
          const canSelect = node.isAssignable && !disabled;
          const isFolder = !hasChildren && !node.isAssignable;

          const activate = () => {
            if (canSelect) {
              onSelectNode(node);
            } else if (hasChildren) {
              onToggleExpanded(node.code);
            }
          };

          return (
            <Fragment key={node.id}>
              <div
                className={cn(
                  'taxo__row',
                  hasChildren && 'taxo__row--cat',
                  hasChildren && !isExpanded && 'taxo__row--collapsed',
                  isSelected && 'taxo__row--on',
                  isFolder && 'taxo__row--folder',
                )}
                style={{ paddingLeft: `${0.85 + depth * 1.15}rem` }}
                role="button"
                tabIndex={0}
                aria-disabled={isFolder}
                onClick={activate}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    activate();
                  }
                }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    className="taxo__caret"
                    aria-label={isExpanded ? 'Reduire' : 'Developper'}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleExpanded(node.code);
                    }}
                  >
                    <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                ) : node.isAssignable ? (
                  <span className="taxo__radio" aria-hidden="true" />
                ) : (
                  <span className="taxo__spacer" aria-hidden="true" />
                )}
                <span className="taxo__label">{node.label}</span>
                <span className="taxo__meta">
                  {hasChildren
                    ? `${node.children.length} sous-categorie${node.children.length > 1 ? 's' : ''}`
                    : node.isAssignable
                      ? ''
                      : 'Dossier'}
                </span>
              </div>
              {hasChildren && isExpanded ? (
                <TaxonomyRows
                  nodes={node.children}
                  depth={depth + 1}
                  query={query}
                  selectedNodeId={selectedNodeId}
                  activeNodeCodes={activeNodeCodes}
                  disabled={disabled}
                  expandedState={expandedState}
                  onToggleExpanded={onToggleExpanded}
                  onSelectNode={onSelectNode}
                />
              ) : null}
            </Fragment>
          );
        })}
    </>
  );
}

export function ObjectWorkspaceTaxonomyFields({
  value,
  objectType,
  access,
  onChange,
}: ObjectWorkspaceTaxonomyFieldsProps) {
  const disabled = !access.canDirectWrite;
  const visibleDomains = getVisibleTaxonomyDomains(value, objectType);
  const [expandedByDomain, setExpandedByDomain] = useState<Record<string, Record<string, boolean>>>({});
  const [searchByDomain, setSearchByDomain] = useState<Record<string, string>>({});

  const treeByDomain = useMemo(
    () => new Map(visibleDomains.map((domain) => [domain.domain, buildTaxonomyTree(domain.nodes)])),
    [visibleDomains],
  );

  function handleSelect(domain: ObjectWorkspaceTaxonomyDomain, node: ObjectWorkspaceTaxonomyNodeOption) {
    const currentAssignment = domain.assignment;
    const path = buildPathFromNodes(domain, node);

    onChange(updateDomainAssignment(value, domain.domain, {
      recordId: currentAssignment?.recordId ?? null,
      nodeId: node.id,
      code: node.code,
      label: node.label,
      description: node.description,
      depth: Math.max(0, path.length - 1),
      path,
      updatedAt: currentAssignment?.updatedAt ?? '',
      source: currentAssignment?.source ?? '',
    }));
  }

  function handleClear(domain: ObjectWorkspaceTaxonomyDomain) {
    onChange(updateDomainAssignment(value, domain.domain, null));
  }

  function toggleExpanded(domainCode: string, nodeCode: string) {
    setExpandedByDomain((previous) => ({
      ...previous,
      [domainCode]: {
        ...(previous[domainCode] ?? {}),
        [nodeCode]: !((previous[domainCode] ?? {})[nodeCode] ?? true),
      },
    }));
  }

  if (visibleDomains.length === 0) {
    return (
      <section className="drawer-form-stack">
        <article className="panel-card panel-card--nested">
          <span className="facet-title">Taxonomie</span>
          <p>Aucune taxonomie specifique n est actuellement configuree pour ce type de fiche.</p>
        </article>
      </section>
    );
  }

  return (
    <section className="drawer-form-stack">
      {visibleDomains.map((domain) => {
        const tree = treeByDomain.get(domain.domain) ?? [];
        const selectedNodeId = domain.assignment?.nodeId ?? null;
        const activeNodeCodes = new Set(domain.assignment?.path.map((node) => node.code) ?? []);
        const search = searchByDomain[domain.domain] ?? '';
        const query = search.trim().toLowerCase();
        const assignmentPath = domain.assignment?.path ?? [];

        return (
          <article key={domain.domain} className="panel-card panel-card--nested">
            <div className="panel-heading">
              <div>
                <span className="facet-title">Taxonomie</span>
                <h3>{domain.label}</h3>
                <p>{domain.description || 'Choisissez la feuille la plus precise dans cet arbre de sous-categories.'}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                disabled={disabled || !domain.assignment}
                onClick={() => handleClear(domain)}
              >
                Effacer
              </Button>
            </div>

            {tree.length > 0 ? (
              <div className="taxo">
                <div className="taxo__head">
                  <div className="taxo__path" aria-label={renderBreadcrumb(domain.assignment)}>
                    {assignmentPath.length > 0 ? (
                      assignmentPath.map((node, index) => (
                        <Fragment key={node.id}>
                          {index > 0 ? <span className="taxo__path-sep">/</span> : null}
                          <strong
                            className={cn(index === assignmentPath.length - 1 && 'taxo__path-current')}
                          >
                            {node.label}
                          </strong>
                        </Fragment>
                      ))
                    ) : (
                      <span className="taxo__path-empty">Aucune sous-categorie selectionnee</span>
                    )}
                  </div>
                  <label className="taxo__search">
                    <Search className="taxo__search-icon" strokeWidth={2} aria-hidden="true" />
                    <input
                      type="text"
                      placeholder="Rechercher..."
                      value={search}
                      onChange={(event) =>
                        setSearchByDomain((previous) => ({
                          ...previous,
                          [domain.domain]: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="taxo__rows">
                  <TaxonomyRows
                    nodes={tree}
                    depth={0}
                    query={query}
                    selectedNodeId={selectedNodeId}
                    activeNodeCodes={activeNodeCodes}
                    disabled={disabled}
                    expandedState={expandedByDomain[domain.domain] ?? {}}
                    onToggleExpanded={(nodeCode) => toggleExpanded(domain.domain, nodeCode)}
                    onSelectNode={(node) => handleSelect(domain, node)}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                La taxonomie de ce domaine n est pas encore chargee dans le workspace.
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}

export function ObjectWorkspaceTaxonomyPanel({
  value,
  objectType,
  access,
  onChange,
}: ObjectWorkspaceTaxonomyPanelProps) {
  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Taxonomie</span>
            <h2>Sous-categories hierarchiques</h2>
            <p>Rattachez la fiche au noeud le plus precis de l arbre metier. Les classifications officielles restent dans le module distinctions.</p>
          </div>
        </div>
      </article>

      <ObjectWorkspaceTaxonomyFields
        value={value}
        objectType={objectType}
        access={access}
        onChange={onChange}
      />
    </div>
  );
}
