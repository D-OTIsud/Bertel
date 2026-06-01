import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionDescriptions } from './SectionDescriptions';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

// Field has no htmlFor/id wiring so getByLabelText is unavailable.
// Accroche Textarea is selected via data-testid="chapo-textarea".

jest.mock('../../../store/session-store', () => ({
  useSessionStore: (selector: (state: { orgName: string | null }) => unknown) =>
    selector({ orgName: null }),
}));

const emptyField = () => ({ baseValue: '', values: {} as Record<string, string> });
const scope = (over = {}) => ({
  recordId: null, scope: 'object' as const, placeId: null, label: '', visibility: 'public',
  description: emptyField(), chapo: emptyField(), adaptedDescription: emptyField(),
  mobileDescription: emptyField(), editorialDescription: emptyField(), ...over,
});

function modules(orgOverlay: unknown = null): ObjectWorkspaceModules {
  return {
    generalInfo: { name: 'A', commercialVisibility: 'full' },
    descriptions: {
      localLanguage: 'fr', activeLanguage: 'fr', availableLanguages: ['fr', 'en'],
      object: scope({ description: { baseValue: '', values: { fr: 'Un descriptif' } } }),
      orgOverlay,
      places: [],
    },
  } as unknown as ObjectWorkspaceModules;
}

const canonicalOnly = { descriptions: { canEditCanonical: true, canEditOrgEnrichment: false } } as unknown as ObjectWorkspacePermissions;
const bothLayers = { descriptions: { canEditCanonical: true, canEditOrgEnrichment: true } } as unknown as ObjectWorkspacePermissions;

describe('SectionDescriptions', () => {
  it('renders the descriptif for the active language', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionDescriptions editor={result.current} permissions={canonicalOnly} />);
    expect(screen.getByDisplayValue('Un descriptif')).toBeInTheDocument();
  });

  it('no longer renders the OTI fields', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionDescriptions editor={result.current} permissions={bothLayers} />);
    expect(screen.queryByText('Accroche OTI')).not.toBeInTheDocument();
    expect(screen.queryByText('Descriptif OTI')).not.toBeInTheDocument();
  });

  it('hides the org scope tab without enrichment rights', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionDescriptions editor={result.current} permissions={canonicalOnly} />);
    expect(screen.queryByText(/Mon organisation/)).not.toBeInTheDocument();
  });

  it('shows the org scope tab and edits the overlay when enrichment is allowed', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules(scope())));
    render(<SectionDescriptions editor={result.current} permissions={bothLayers} />);
    fireEvent.click(screen.getByText(/Mon organisation/));
    // Field has no htmlFor association — select Accroche via data-testid.
    const accroche = screen.getByTestId('chapo-textarea') as HTMLTextAreaElement;
    fireEvent.change(accroche, { target: { value: 'Accroche OTI propre' } });
    expect(result.current.draft.descriptions.orgOverlay?.chapo.baseValue).toBe('Accroche OTI propre');
    expect(result.current.draft.descriptions.object.chapo.baseValue).toBe('');
  });
});
