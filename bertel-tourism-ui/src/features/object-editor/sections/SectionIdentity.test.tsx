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
    nodeId: 'n-hotel',
    code: 'hotel',
    label: 'Hôtel',
    description: '',
    depth: 1,
    path: [
      { id: 'n-hotel', code: 'hotel', label: 'Hôtel', description: '', depth: 0 },
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
    positionings: {
      options: [
        { code: 'hotel_with_restaurant', label: 'Hôtel-restaurant', description: '' },
        { code: 'family_hotel', label: 'Hôtel familial', description: '' },
      ],
      selectedCodes: ['hotel_with_restaurant', 'family_hotel'],
      unavailableReason: null,
    },
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
    isAssignable: true,
    position: 1,
    axis: 'nature',
  },
  {
    id: 'n-hotel-restaurant',
    code: 'hotel_with_restaurant',
    label: 'Hôtel-restaurant',
    description: '',
    parentId: 'n-hotel',
    parentCode: 'hotel',
    depth: 1,
    isAssignable: true,
    position: 2,
    axis: 'positionnement',
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
    position: 3,
    axis: 'positionnement',
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
    position: 4,
    axis: 'sous_type',
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
  it('renders the commercial name and ID OTI without exposing the technical object type', () => {
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
    expect(screen.getByText('HLORUN00000000TV')).toBeInTheDocument();
    expect(screen.queryByText('HOT — Hôtel')).not.toBeInTheDocument();
    expect(screen.queryByText('Type de fiche Bertel')).not.toBeInTheDocument();
    // Raison sociale moved out of §01 (it is edited in §18 Fournisseur).
    expect(screen.queryByDisplayValue('SARL Domaine du Bel Air')).not.toBeInTheDocument();
  });

  it('uses the canonical accommodation vocabulary with no "taxonomie" jargon', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText(/taxonomie/i)).not.toBeInTheDocument();
    expect(screen.getByText("Nature d'hébergement")).toBeInTheDocument();
  });

  it('does not expose technical compatibility explanations in the editing form', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} typeCode="HOT" />);

    expect(screen.queryByText(/Seules les natures compatibles/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/conversion de type de fiche/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Répond à/i)).not.toBeInTheDocument();
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
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByText('Hôtel').length).toBeGreaterThanOrEqual(2);
    expect(within(dialog).queryByText('Hôtel-restaurant')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Hôtel familial')).not.toBeInTheDocument();
  });

  it('highlights the full selected taxonomy path in the tree', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    const dialog = screen.getByRole('dialog');
    const selectedRow = within(dialog).getByRole('radio', { name: /^Hôtel/ }).closest('.taxo2-row');
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

    fireEvent.click(within(dialog).getByRole('button', { name: 'Développer Hôtel' }));
    // Leaves are radios in the single-column tree.
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

  it('n’expose pas la description de catalogue comme infobulle utilisateur', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Développer Hôtel' }));
    const radio = within(dialog).getByRole('radio', { name: /Gîte rural/i });
    expect(radio.closest('.taxo2-row')).not.toHaveAttribute('title');
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

  it('retrouve un libellé canonique avec son ancien libellé (alias de reprise)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /nature d.hébergement/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Rechercher une nature d’hébergement'), {
      target: { value: 'location saisonnière' },
    });

    expect(within(dialog).getByRole('radio', { name: /Gîte rural/i })).toBeInTheDocument();
    // L'alias reste cherchable et affiché, mais SANS nommer l'ancien système (cf. FiltersPanel).
    expect(within(dialog).getByText(/Aussi appelé : Location saisonnière/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Berta/)).not.toBeInTheDocument();
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

  it('édite le positionnement sans remplacer la nature Hôtel', () => {
    const modules = modulesWithTaxonomy(editableTaxonomyNodes);
    modules.taxonomy.positionings = {
      options: [
        { code: 'family_hotel', label: 'Hôtel familial', description: '' },
        { code: 'boutique_hotel', label: 'Hôtel boutique', description: '' },
      ],
      selectedCodes: ['family_hotel'],
      unavailableReason: null,
    };
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const { rerender } = render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hôtel boutique' }));
    rerender(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.taxonomy.positionings?.selectedCodes).toEqual([
      'family_hotel',
      'boutique_hotel',
    ]);
    expect(result.current.draft.taxonomy.domains[0].assignment?.code).toBe('hotel');
  });

  it('permet de porter DEUX unités à la fois — la nature reste intacte', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithUnitTypes(UNIT_TYPES)));
    const { rerender } = render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(screen.getByText("Type d'unité")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bulle' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Lodge' }));
    rerender(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.taxonomy.unitTypes.selectedCodes).toEqual(['bubble', 'lodge']);
    // Une reprise de FORME ne déplace jamais l'établissement.
    expect(result.current.draft.taxonomy.domains[0].assignment?.code).toBe('hotel');
  });

  it('retire une unité au second clic', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithUnitTypes(UNIT_TYPES)));
    const { rerender } = render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bulle' }));
    rerender(<SectionIdentity editor={result.current} permissions={allowAll} />);
    expect(result.current.draft.taxonomy.unitTypes.selectedCodes).toEqual([]);
  });

  it("n'affiche pas de message technique quand le catalogue manque", () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithUnitTypes({
      options: [], selectedCodes: [], unavailableReason: "Le catalogue des types d'unité n'est pas encore disponible sur cette base.",
    })));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText(/catalogue des types d.unité n.est pas encore disponible/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Type d.unité/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bulle' })).not.toBeInTheDocument();
  });

  it("n'affiche rien quand l'objet n'est pas un hébergement (catalogue vide, aucun motif)", () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithUnitTypes({
      options: [], selectedCodes: [], unavailableReason: null,
    })));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText(/Type d.unité/)).not.toBeInTheDocument();
  });
});
