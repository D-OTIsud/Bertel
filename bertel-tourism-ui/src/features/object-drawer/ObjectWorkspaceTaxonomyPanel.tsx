import { useMemo, useState } from 'react';
import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceTaxonomyAssignment,
  ObjectWorkspaceTaxonomyDomain,
  ObjectWorkspaceTaxonomyModule,
  ObjectWorkspaceTaxonomyNodeOption,
  ObjectWorkspaceTaxonomyPathNode,
} from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';

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

function TaxonomyTree({
  domain,
  nodes,
  selectedNodeId,
  activeNodeCodes,
  disabled,
  expandedState,
  onToggleExpanded,
  onSelectNode,
}: {
  domain: ObjectWorkspaceTaxonomyDomain;
  nodes: TaxonomyTreeNode[];
  selectedNodeId: string | null;
  activeNodeCodes: Set<string>;
  disabled: boolean;
  expandedState: Record<string, boolean>;
  onToggleExpanded: (nodeCode: string) => void;
  onSelectNode: (node: ObjectWorkspaceTaxonomyNodeOption) => void;
}) {
  return (
    <div className="stack-list">
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isSelected = selectedNodeId === node.id;
        const isExpanded = expandedState[node.code] ?? (activeNodeCodes.has(node.code) || node.depth < 1);

        return (
          <div key={node.id} className="panel-card panel-card--nested">
            <div className="panel-heading">
              <div style={{ paddingLeft: `${node.depth * 1.25}rem` }}>
                <span className="facet-title">{node.depth === 0 ? domain.label : 'Sous-categorie'}</span>
                <h3>{node.label}</h3>
                {node.description ? <p>{node.description}</p> : null}
              </div>

              <div className="inline-actions">
                {hasChildren ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => onToggleExpanded(node.code)}
                  >
                    {isExpanded ? 'Masquer' : 'Afficher'}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant={isSelected ? 'default' : 'outline'}
                  disabled={disabled || !node.isAssignable}
                  onClick={() => onSelectNode(node)}
                >
                  {isSelected ? 'Selectionne' : node.isAssignable ? 'Choisir' : 'Dossier'}
                </Button>
              </div>
            </div>

            {isExpanded && hasChildren ? (
              <TaxonomyTree
                domain={domain}
                nodes={node.children}
                selectedNodeId={selectedNodeId}
                activeNodeCodes={activeNodeCodes}
                disabled={disabled}
                expandedState={expandedState}
                onToggleExpanded={onToggleExpanded}
                onSelectNode={onSelectNode}
              />
            ) : null}
          </div>
        );
      })}
    </div>
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

  return (
    <section className="drawer-form-stack">
      {visibleDomains.length > 0 ? visibleDomains.map((domain) => {
          const tree = treeByDomain.get(domain.domain) ?? [];
          const selectedNodeId = domain.assignment?.nodeId ?? null;
          const activeNodeCodes = new Set(domain.assignment?.path.map((node) => node.code) ?? []);

          return (
            <article key={domain.domain} className="panel-card panel-card--nested">
              <div className="panel-heading">
                <div>
                  <span className="facet-title">Taxonomie</span>
                  <h3>{domain.label}</h3>
                  <p>{domain.description || 'Choisissez la feuille la plus precise dans cet arbre de sous-categories.'}</p>
                </div>
                <div className="stack-list text-right">
                  <strong>{renderBreadcrumb(domain.assignment)}</strong>
                  <small className="text-muted-foreground">
                    {domain.assignment?.source ? `Source: ${domain.assignment.source}` : 'Selection manuelle dans la taxonomie.'}
                  </small>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={disabled || !domain.assignment}
                    onClick={() => handleClear(domain)}
                  >
                    Effacer
                  </Button>
                </div>
              </div>

              {tree.length > 0 ? (
                <TaxonomyTree
                  domain={domain}
                  nodes={tree}
                  selectedNodeId={selectedNodeId}
                  activeNodeCodes={activeNodeCodes}
                  disabled={disabled}
                  expandedState={expandedByDomain[domain.domain] ?? {}}
                  onToggleExpanded={(nodeCode) => toggleExpanded(domain.domain, nodeCode)}
                  onSelectNode={(node) => handleSelect(domain, node)}
                />
              ) : (
                <article className="panel-card panel-card--nested">
                  <span className="facet-title">{domain.label}</span>
                  <p>La taxonomie de ce domaine n est pas encore chargee dans le workspace.</p>
                </article>
              )}
            </article>
          );
        }) : (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Taxonomie</span>
            <p>Aucune taxonomie specifique n est actuellement configuree pour ce type de fiche.</p>
          </article>
        )}
    </section>
  );
}

export function ObjectWorkspaceTaxonomyPanel({
  value,
  objectType,
  dirty,
  saving,
  statusMessage,
  saveAction,
  access,
  onChange,
  onSave,
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
          <div className="stack-list text-right">
            <Button type="button" variant="outline" onClick={onSave} disabled={saveAction.disabled || saving || !dirty}>
              {saving ? 'Enregistrement...' : saveAction.label}
            </Button>
            {saveAction.hint ? <small className="text-muted-foreground">{saveAction.hint}</small> : null}
            {statusMessage ? <small className="text-muted-foreground">{statusMessage}</small> : null}
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
