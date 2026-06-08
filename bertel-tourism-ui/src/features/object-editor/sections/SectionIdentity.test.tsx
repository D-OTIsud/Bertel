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
    expect(screen.getByText('HOT — Hotel')).toBeInTheDocument();
    // Raison sociale moved out of §01 (it is edited in §18 Fournisseur).
    expect(screen.queryByDisplayValue('SARL Domaine du Bel Air')).not.toBeInTheDocument();
  });

  it('titles the section "Identité & catégorie" with no "taxonomie" jargon', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText(/taxonomie/i)).not.toBeInTheDocument();
    expect(screen.getByText('Sous-catégorie')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the current taxonomy path inside the modal', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByText('Hôtel').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Hôtel familial')).toBeInTheDocument();
  });

  it('highlights the full selected taxonomy path in the tree', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie/i }));
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

    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/options de sous-catégorie ne sont pas disponibles/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Valider la sélection' })).toBeDisabled();
  });

  it('lets an assignable taxonomy node update the draft assignment', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    const { rerender } = render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie/i }));
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

  it('titles the redesigned modal "Choisir une sous-catégorie"', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie/i }));
    expect(screen.getByText('Choisir une sous-catégorie')).toBeInTheDocument();
  });

  it('badges the saved assignment as "Actuelle"', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie/i }));
    expect(within(screen.getByRole('dialog')).getByText('Actuelle')).toBeInTheDocument();
  });

  it('filters the tree with the search box', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Rechercher une sous-catégorie'), {
      target: { value: 'rural' },
    });

    expect(within(dialog).getByRole('radio', { name: /Gîte rural/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('radio', { name: /Hôtel familial/i })).not.toBeInTheDocument();
  });

  it('reveals the current selection when "Modifier" is clicked after a search', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy(editableTaxonomyNodes)));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie/i }));
    const dialog = screen.getByRole('dialog');
    const search = within(dialog).getByLabelText('Rechercher une sous-catégorie');
    fireEvent.change(search, { target: { value: 'rural' } });
    expect(within(dialog).queryByRole('radio', { name: /Hôtel familial/i })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /Modifier/i }));
    expect(search).toHaveValue('');
    expect(within(dialog).getByRole('radio', { name: /Hôtel familial/i })).toBeInTheDocument();
  });
});
