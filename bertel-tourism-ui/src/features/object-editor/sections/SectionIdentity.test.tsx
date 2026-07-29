import { fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionIdentity } from './SectionIdentity';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import type {
  ObjectWorkspaceModules,
  ObjectWorkspaceTaxonomyAssignment,
  ObjectWorkspaceTaxonomyDomain,
} from '../../../services/object-workspace-parser';

/** A taxonomy domain with an assignment + hierarchical path; `nodes` defaults to empty. */
function taxonomyDomainFixture(
  nodes: ObjectWorkspaceTaxonomyDomain['nodes'] = [],
  assignment: ObjectWorkspaceTaxonomyAssignment | null = {
    recordId: 'tx1',
    nodeId: 'n-hotel-familial',
    code: 'family_hotel',
    label: 'Hôtel familial',
    description: '',
    depth: 1,
    path: [
      { id: 'n-hotel', code: 'hotel', label: 'Hôtel', description: '', depth: 0 },
      { id: 'n-hotel-familial', code: 'family_hotel', label: 'Hôtel familial', description: '', depth: 1 },
    ],
    updatedAt: '',
    source: '',
  },
): ObjectWorkspaceTaxonomyDomain {
  return {
    domain: 'hosting_kind',
    label: "Type d'hébergement",
    description: '',
    objectType: 'HOT',
    nodes,
    assignment,
  };
}

function modulesWithTaxonomy(
  nodes: ObjectWorkspaceTaxonomyDomain['nodes'] = [],
  assignment?: ObjectWorkspaceTaxonomyAssignment | null,
): ObjectWorkspaceModules {
  const modules = fullModulesFixture();
  modules.taxonomy = {
    domains: [assignment === undefined ? taxonomyDomainFixture(nodes) : taxonomyDomainFixture(nodes, assignment)],
    unitTypes: { options: [], selectedCodes: [], unavailableReason: null },
    unavailableReason: null,
  };
  return modules;
}

const editableTaxonomyNodes: ObjectWorkspaceTaxonomyDomain['nodes'] = [
  {
    id: 'n-hotel',
    code: 'hotel',
    label: 'Hôtel',
    description: '',
    parentId: null,
    parentCode: null,
    depth: 0,
    isAssignable: false,
    position: 1,
  },
  {
    id: 'n-hotel-familial',
    code: 'family_hotel',
    label: 'Hôtel familial',
    description: '',
    parentId: 'n-hotel',
    parentCode: 'hotel',
    depth: 1,
    isAssignable: true,
    position: 2,
  },
  {
    id: 'n-gite-rural',
    code: 'rural_gite',
    label: 'Gîte rural',
    description: 'Meublé proposé à une clientèle de passage.',
    parentId: 'n-hotel',
    parentCode: 'hotel',
    depth: 1,
    isAssignable: true,
    position: 3,
    aliases: ['Location saisonnière'],
    sourceRef: 'Code du tourisme art. D324-1',
  },
];

const nestedAssignableNodes: ObjectWorkspaceTaxonomyDomain['nodes'] = [
  { id: 'n-cat', code: 'cat', label: 'Catégorie mère', description: '', parentId: null, parentCode: null, depth: 0, isAssignable: true, position: 1 },
  { id: 'n-sub', code: 'sub', label: 'Sous-catégorie', description: '', parentId: 'n-cat', parentCode: 'cat', depth: 1, isAssignable: true, position: 2 },
];

const nestedAssignment: ObjectWorkspaceTaxonomyAssignment = {
  recordId: 'a', nodeId: 'n-sub', code: 'sub', label: 'Sous-catégorie', description: '', depth: 1,
  path: [
    { id: 'n-cat', code: 'cat', label: 'Catégorie mère', description: '', depth: 0 },
    { id: 'n-sub', code: 'sub', label: 'Sous-catégorie', description: '', depth: 1 },
  ],
  updatedAt: '', source: '',
};

describe('SectionIdentity', () => {
  it('renders the commercial name, ID OTI and object type', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(
      <SectionIdentity
        editor={result.current}
        permissions={allowAll}
        objectId="HLORUN00000000TV"
        typeCode="HOT"
      />,
    );

    expect(screen.getByDisplayValue('Domaine du Bel Air')).toBeInTheDocument();
    // ID OTI and object type are read-only readouts (static text), not editable inputs.
    expect(screen.getByText('HLORUN00000000TV')).toBeInTheDocument();
    expect(screen.getByText('HOT — Hôtel')).toBeInTheDocument();
    // Raison sociale moved out of §01 (it is edited in §18 Fournisseur).
    expect(screen.queryByDisplayValue('SARL Domaine du Bel Air')).not.toBeInTheDocument();
  });

  it('uses the canonical accommodation vocabulary with no "taxonomie" jargon', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText(/taxonomie/i)).not.toBeInTheDocument();
    expect(screen.getByText("Nature d'hébergement")).toBeInTheDocument();
  });

  it('renders a single bullet on the object type (no doubled prefix)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} typeCode="HOT" />);

    expect(screen.getAllByText('●')).toHaveLength(1);
  });

  it('no longer shows the publication status — it moved to the editor rail', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Statut publication')).not.toBeInTheDocument();
    expect(screen.queryByText('Publié — en ligne')).not.toBeInTheDocument();
  });

  it('opens a modal when the taxonomy field is clicked', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the current taxonomy path inside the modal', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByText('Hôtel').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Hôtel familial')).toBeInTheDocument();
  });

  it('highlights the full selected taxonomy path in the tree', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    const dialog = screen.getByRole('dialog');
    const parentRow = within(dialog).getByRole('button', { name: /^Hôtel$/ }).closest('.taxo2-row');
    const selectedRow = within(dialog).getByRole('radio', { name: /Hôtel familial/i }).closest('.taxo2-row');

    expect(parentRow).toHaveClass('is-selected-path');
    expect(parentRow).not.toHaveClass('is-selected');
    expect(selectedRow).toHaveClass('is-selected-path');
    expect(selectedRow).toHaveClass('is-selected');
  });

  it('shows an unavailable message and a disabled validate button when taxonomy options are not exposed', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/options de nature d.hébergement ne sont pas disponibles/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Valider la sélection' })).toBeDisabled();
  });

  it('lets an assignable taxonomy node update the draft assignment', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    const { rerender } = render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Valider la sélection' })).toBeDisabled();

    // Leaves are radios in the single-column tree; the current branch is pre-expanded.
    fireEvent.click(within(dialog).getByRole('radio', { name: /Gîte rural/i }));
    expect(within(dialog).getByRole('button', { name: 'Valider la sélection' })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Valider la sélection' }));

    expect(result.current.dirtySections.taxonomy).toBe(true);
    rerender(<SectionIdentity editor={result.current} permissions={allowAll} />);
    expect(screen.getByText('Hôtel ▸ Gîte rural')).toBeInTheDocument();
  });

  it('titles the redesigned modal "Choisir la nature d’hébergement"', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    expect(screen.getByText('Choisir la nature d’hébergement')).toBeInTheDocument();
  });

  it('badges the saved assignment as "Actuelle"', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    expect(within(screen.getByRole('dialog')).getByText('Actuelle')).toBeInTheDocument();
  });

  it('filters the tree with the search box', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Rechercher une nature d’hébergement'), {
      target: { value: 'rural' },
    });

    expect(within(dialog).getByRole('radio', { name: /Gîte rural/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('radio', { name: /Hôtel familial/i })).not.toBeInTheDocument();
  });

  it('retrouve un libellé canonique avec son ancien terme Berta', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Rechercher une nature d’hébergement'), {
      target: { value: 'location saisonnière' },
    });

    expect(within(dialog).getByRole('radio', { name: /Gîte rural/i })).toBeInTheDocument();
    expect(within(dialog).getByText(/Berta : Location saisonnière/)).toBeInTheDocument();
  });

  it('checks the parent radio when a child is selected (the whole path reads as selected)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(nestedAssignableNodes, nestedAssignment)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: /Catégorie mère/ })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: /Sous-catégorie/ })).toBeChecked();
  });

  it('narrows the selection to the parent when the parent row is clicked', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(nestedAssignableNodes, nestedAssignment)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: /Catégorie mère/ }));
    expect(within(dialog).getByRole('radio', { name: /Catégorie mère/ })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: /Sous-catégorie/ })).not.toBeChecked();
  });

  it('no longer shows a redundant "Modifier" button (the modal is already the edit surface)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Modifier/i })).not.toBeInTheDocument();
  });
});

describe("§201 — types d'unité (axe multi-valué)", () => {
  const UNIT_TYPES = {
    options: [
      { code: 'bubble', label: 'Bulle', description: 'Unité transparente.' },
      { code: 'lodge', label: 'Lodge', description: 'Unité de type lodge.' },
    ],
    selectedCodes: ['bubble'],
    unavailableReason: null,
  };

  function modulesWithUnitTypes(unitTypes: ObjectWorkspaceModules['taxonomy']['unitTypes']) {
    const modules = modulesWithTaxonomy();
    modules.taxonomy = { ...modules.taxonomy, unitTypes };
    return modules;
  }

  it('permet de porter DEUX unités à la fois — la nature reste intacte', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithUnitTypes(UNIT_TYPES)));
    const { rerender } = render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(screen.getByRole('button', { name: 'Bulle' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Lodge' }));
    rerender(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.taxonomy.unitTypes.selectedCodes).toEqual(['bubble', 'lodge']);
    // Une reprise de FORME ne déplace jamais l'établissement.
    expect(result.current.draft.taxonomy.domains[0].assignment?.code).toBe('family_hotel');
  });

  it('retire une unité au second clic', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithUnitTypes(UNIT_TYPES)));
    const { rerender } = render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bulle' }));
    rerender(<SectionIdentity editor={result.current} permissions={allowAll} />);
    expect(result.current.draft.taxonomy.unitTypes.selectedCodes).toEqual([]);
  });

  it('affiche un motif au lieu d\u2019un s\u00e9lecteur vide quand le catalogue manque', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithUnitTypes({
      options: [], selectedCodes: [], unavailableReason: "Le catalogue des types d'unité n'est pas encore disponible sur cette base.",
    })));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/catalogue des types d.unité n.est pas encore disponible/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bulle' })).not.toBeInTheDocument();
  });

  it("n'affiche rien quand l'objet n'est pas un hébergement (catalogue vide, aucun motif)", () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithUnitTypes({
      options: [], selectedCodes: [], unavailableReason: null,
    })));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText(/Types d.unité/)).not.toBeInTheDocument();
  });
});
