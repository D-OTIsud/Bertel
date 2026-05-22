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
    description: '',
    parentId: 'n-hotel',
    parentCode: 'hotel',
    depth: 1,
    isAssignable: true,
    position: 3,
  },
];

const hloTaxonomyNodes: ObjectWorkspaceTaxonomyDomain['nodes'] = [
  {
    id: 'n-location-saisonniere',
    code: 'location_saisonniere',
    label: 'Location saisonnière',
    description: '',
    parentId: null,
    parentCode: null,
    depth: 0,
    isAssignable: false,
    position: 1,
  },
  {
    id: 'n-appartement',
    code: 'appartement',
    label: 'Appartement',
    description: '',
    parentId: 'n-location-saisonniere',
    parentCode: 'location_saisonniere',
    depth: 1,
    isAssignable: true,
    position: 2,
  },
  {
    id: 'n-bungalow',
    code: 'bungalow_chalet',
    label: 'Bungalow & Chalet',
    description: '',
    parentId: 'n-location-saisonniere',
    parentCode: 'location_saisonniere',
    depth: 1,
    isAssignable: true,
    position: 3,
  },
  {
    id: 'n-chambre-hotes',
    code: 'chambre_d_hotes',
    label: "Chambre d'hôtes",
    description: '',
    parentId: null,
    parentCode: null,
    depth: 0,
    isAssignable: false,
    position: 4,
  },
  {
    id: 'n-chambre-hote',
    code: 'chambre_d_hote',
    label: "Chambre d'hôte",
    description: '',
    parentId: 'n-chambre-hotes',
    parentCode: 'chambre_d_hotes',
    depth: 1,
    isAssignable: true,
    position: 5,
  },
];

describe('SectionIdentity', () => {
  it('renders the commercial name, ID OTI, object type and raison sociale', () => {
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
    expect(screen.getByDisplayValue('HLORUN00000000TV')).toBeInTheDocument();
    expect(screen.getByDisplayValue('HOT — Hotel')).toBeInTheDocument();
    expect(screen.getByDisplayValue('SARL Domaine du Bel Air')).toBeInTheDocument();
  });

  it('renders publication status options without emoji', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(4);
    for (const option of options) {
      expect(option.textContent ?? '').not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });

  it('keeps the technical publication status values', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    const values = screen.getAllByRole('option').map((option) => (option as HTMLOptionElement).value);
    expect(values).toEqual(['published', 'draft', 'hidden', 'archived']);
  });

  it('opens a modal when the taxonomy field is clicked', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie métier/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the current taxonomy path inside the modal', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie métier/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByText('Hôtel').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Hôtel familial')).toBeInTheDocument();
  });

  it('shows an unavailable message and a disabled validate button when taxonomy options are not exposed', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie métier/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/options de sous-catégorie ne sont pas disponibles/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/pas encore disponible/i)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Valider' })).toBeDisabled();
  });

  it('lets an assignable taxonomy node update the draft assignment', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    const { rerender } = render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie métier/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText(/pas encore disponible/i)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Valider' })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole('button', { name: /Gîte rural/i }));
    expect(within(dialog).getByRole('button', { name: 'Valider' })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Valider' }));

    expect(result.current.dirtySections.taxonomy).toBe(true);
    rerender(<SectionIdentity editor={result.current} permissions={allowAll} />);
    expect(screen.getByText('Hôtel ▸ Gîte rural')).toBeInTheDocument();
  });

  it('shows taxonomy parent nodes as groups with selectable children', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(hloTaxonomyNodes, null)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie métier/i }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText('Location saisonnière')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Location saisonnière$/i })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Appartement/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Bungalow & Chalet/i })).toBeInTheDocument();
  });

  it('collapses near-identical parent and child taxonomy labels into one selectable choice', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(hloTaxonomyNodes, null)));
    const { rerender } = render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie métier/i }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getAllByText(/Chambre d'hôtes?/i)).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('button', { name: /Chambre d'hôtes/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Valider' }));

    rerender(<SectionIdentity editor={result.current} permissions={allowAll} />);
    expect(screen.getByText("Chambre d'hôtes")).toBeInTheDocument();
    expect(screen.queryByText(/Chambre d'hôtes ▸ Chambre d'hôte/i)).not.toBeInTheDocument();
  });
});
