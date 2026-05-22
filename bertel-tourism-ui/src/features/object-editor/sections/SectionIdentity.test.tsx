import { fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionIdentity } from './SectionIdentity';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import type {
  ObjectWorkspaceModules,
  ObjectWorkspaceTaxonomyDomain,
} from '../../../services/object-workspace-parser';

/** A taxonomy domain with an assignment + hierarchical path; `nodes` defaults to empty
 *  (the live state — taxonomy node enrichment is gated off). */
function taxonomyDomainFixture(
  nodes: ObjectWorkspaceTaxonomyDomain['nodes'] = [],
): ObjectWorkspaceTaxonomyDomain {
  return {
    domain: 'hosting_kind',
    label: "Type d'hébergement",
    description: '',
    objectType: 'HOT',
    nodes,
    assignment: {
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
  };
}

function modulesWithTaxonomy(): ObjectWorkspaceModules {
  const modules = fullModulesFixture();
  modules.taxonomy = { domains: [taxonomyDomainFixture()], unavailableReason: null };
  return modules;
}

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
    expect(within(dialog).getByText('Hôtel')).toBeInTheDocument();
    expect(within(dialog).getByText('Hôtel familial')).toBeInTheDocument();
  });

  it('shows an unavailability message and a disabled validate button when taxonomy options are not exposed', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithTaxonomy()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} />);

    fireEvent.click(screen.getByRole('button', { name: /sous-catégorie métier/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/pas encore disponible/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Valider' })).toBeDisabled();
  });

  it('shows "Aucune famille secondaire" when secondary_types is empty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionIdentity editor={result.current} permissions={allowAll} archetype="HEB" />);

    expect(screen.getByText('Aucune famille secondaire')).toBeInTheDocument();
    expect(screen.queryByText('Principal')).not.toBeInTheDocument();
  });

  it('renders real secondary families and never the archetype as a secondary family', () => {
    const modules = fullModulesFixture();
    modules.generalInfo.secondaryTypes = ['RES'];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(
      <SectionIdentity
        editor={result.current}
        permissions={allowAll}
        archetype="HEB"
        typeCode="HOT"
      />,
    );

    expect(screen.getByText('RES — Restaurant')).toBeInTheDocument();
    expect(screen.queryByText('Aucune famille secondaire')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'HEB' })).not.toBeInTheDocument();
  });
});
