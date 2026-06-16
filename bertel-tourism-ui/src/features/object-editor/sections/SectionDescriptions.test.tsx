import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionDescriptions } from './SectionDescriptions';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

// Field has no htmlFor/id wiring so getByLabelText is unavailable.
// Accroche Textarea is selected via data-testid="chapo-textarea".

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
    characteristics: {
      languageOptions: [
        { id: 'fr', code: 'fr', label: 'Français' },
        { id: 'de', code: 'de', label: 'Allemand' },
      ],
      languageLevelOptions: [{ id: 'l1', code: 'fluent', label: 'Courant' }],
      selectedLanguages: [],
      paymentOptions: [],
      selectedPaymentCodes: [],
      environmentOptions: [],
      selectedEnvironmentCodes: [],
      amenityGroups: [],
      selectedAmenityCodes: [],
      unavailableReason: null,
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

  it('no longer renders the plan d’accès field (moved to §02 → object_location.direction)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionDescriptions editor={result.current} permissions={bothLayers} />);
    expect(screen.queryByText(/plan d'accès/i)).not.toBeInTheDocument();
  });

  it('does not claim the accroche appears in the Explorer (drawer-only)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionDescriptions editor={result.current} permissions={bothLayers} />);
    expect(screen.queryByTitle(/Explorer/)).not.toBeInTheDocument();
  });

  it('hides the org scope tab without enrichment rights', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionDescriptions editor={result.current} permissions={canonicalOnly} />);
    expect(screen.queryByText(/Personnalis/)).not.toBeInTheDocument();
  });

  it('does not mark the module dirty when only the language tab changes (navigation, not edit)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    const view = render(<SectionDescriptions editor={result.current} permissions={canonicalOnly} />);

    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    view.rerender(<SectionDescriptions editor={result.current} permissions={canonicalOnly} />);
    expect(result.current.draft.descriptions.activeLanguage).toBe('en');
    expect(result.current.dirtySections.descriptions).toBe(false);

    // A real edit still dirties the module.
    fireEvent.change(screen.getByTestId('chapo-textarea'), { target: { value: 'Nouvelle accroche' } });
    expect(result.current.dirtySections.descriptions).toBe(true);
  });

  it('shows the org scope tab and edits the overlay when enrichment is allowed', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules(scope())));
    render(<SectionDescriptions editor={result.current} permissions={bothLayers} />);
    fireEvent.click(screen.getByText(/Personnalis/));
    // Field has no htmlFor association — select Accroche via data-testid.
    const accroche = screen.getByTestId('chapo-textarea') as HTMLTextAreaElement;
    fireEvent.change(accroche, { target: { value: 'Accroche OTI propre' } });
    expect(result.current.draft.descriptions.orgOverlay?.chapo.baseValue).toBe('Accroche OTI propre');
    expect(result.current.draft.descriptions.object.chapo.baseValue).toBe('');
  });

  it('renders the spoken-languages block', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionDescriptions editor={result.current} permissions={canonicalOnly} />);
    expect(screen.getByText('Langues parlées')).toBeInTheDocument();
  });

  it('surfaces a description tab for a spoken language that has no translation yet', () => {
    const base = modules();
    (base as unknown as { characteristics: { selectedLanguages: unknown[] } }).characteristics.selectedLanguages = [
      { languageId: 'de', code: 'de', label: 'Allemand', levelId: 'l1', levelCode: 'fluent', levelLabel: 'Courant' },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', base));
    render(<SectionDescriptions editor={result.current} permissions={canonicalOnly} />);
    // fr + en come from availableLanguages; Deutsch is added by the spoken language.
    expect(screen.getByRole('button', { name: 'Deutsch' })).toBeInTheDocument();
  });
});
