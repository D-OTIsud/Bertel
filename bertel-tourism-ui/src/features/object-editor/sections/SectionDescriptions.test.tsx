import { render, screen, fireEvent, renderHook, waitFor, act } from '@testing-library/react';
import { useObjectEditorState, type ObjectEditorState } from '../useObjectEditorState';
import { SectionDescriptions } from './SectionDescriptions';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';
import { translateWithAi } from '../../../services/ai-translate';

jest.mock('../../../services/ai-translate', () => ({ translateWithAi: jest.fn() }));
jest.mock('../../../hooks/useServiceAvailability', () => ({ useServiceAvailability: jest.fn(() => ({ translation: true, imageAnalysis: true, email: true })) }));

// The Descriptif/Accroche are now MarkdownEditorLazy (TipTap, async + ProseMirror — unreliable in
// jsdom). Mock it as a plain textarea that forwards value + onChange and exposes ariaLabel, so the
// section's wiring (patchField → module) is testable and getByLabelText(/^Accroche|^Descriptif/) works.
jest.mock('../../../components/markdown/MarkdownEditorLazy', () => ({
  MarkdownEditorLazy: ({ value, onChange, ariaLabel, disabled }: { value: string; onChange: (md: string) => void; ariaLabel: string; disabled?: boolean }) => (
    <textarea aria-label={ariaLabel} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const emptyField = () => ({ baseValue: '', values: {} as Record<string, string> });
const scope = (over = {}) => ({
  recordId: null, scope: 'object' as const, placeId: null, label: '', visibility: 'public',
  description: emptyField(), chapo: emptyField(), adaptedDescription: emptyField(),
  mobileDescription: emptyField(), editorialDescription: emptyField(), ...over,
});

describe('SectionDescriptions AI translation', () => {
  let state: ObjectEditorState;
  const translate = translateWithAi as jest.Mock;
  function Harness({ initial, permissions = canonicalOnly }: { initial: ObjectWorkspaceModules; permissions?: ObjectWorkspacePermissions }) {
    state = useObjectEditorState('o1', initial);
    return <SectionDescriptions editor={state} permissions={permissions} />;
  }
  beforeEach(() => jest.clearAllMocks());

  it('offers foreign languages on a FR-only fiche and translates the unsaved source into the draft', async () => {
    const initial = modules();
    initial.descriptions.availableLanguages = ['fr'];
    translate.mockResolvedValue({ chapo: 'Fresh headline', description: 'A description' });
    render(<Harness initial={initial} />);
    fireEvent.change(screen.getByLabelText(/^Accroche/), { target: { value: 'Accroche en cours' } });
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Traduire avec l’IA' }));
    await waitFor(() => expect(screen.getByLabelText(/^Accroche/)).toHaveValue('Fresh headline'));
    expect(translate).toHaveBeenCalledWith(expect.objectContaining({
      objectId: 'o1', sourceLanguage: 'fr', targetLanguage: 'en',
      fields: { chapo: 'Accroche en cours', description: 'Un descriptif' },
    }), expect.any(AbortSignal));
    expect(state.draft.descriptions.object.chapo.baseValue).toBe('Accroche en cours');
    expect(state.draft.descriptions.object.description.values.fr).toBe('Un descriptif');
    expect(state.dirtySections.descriptions).toBe(true);
    expect(state.draft.characteristics.selectedLanguages).toEqual([]);
  });

  it('uses the French canonical source even with an English account preference', async () => {
    const initial = modules();
    initial.descriptions.localLanguage = 'en';
    initial.descriptions.activeLanguage = 'en';
    initial.descriptions.object.description = { baseValue: 'Texte français', values: {} };
    translate.mockResolvedValue({ description: 'English translation' });
    render(<Harness initial={initial} />);
    expect(screen.getByLabelText(/^Descriptif/)).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Traduire avec l’IA' }));
    await waitFor(() => expect(screen.getByLabelText(/^Descriptif/)).toHaveValue('English translation'));
    expect(translate).toHaveBeenCalledWith(expect.objectContaining({ sourceLanguage: 'fr', fields: { description: 'Texte français' } }), expect.any(AbortSignal));
    expect(state.draft.descriptions.object.description.baseValue).toBe('Texte français');
    // Subsequent human edits in EN must not change the FR base either.
    fireEvent.change(screen.getByLabelText(/^Descriptif/), { target: { value: 'Reviewed English' } });
    expect(state.draft.descriptions.object.description.baseValue).toBe('Texte français');
  });

  it('translates personalised copy within that scope while preserving the canonical copy', async () => {
    const initial = modules(scope({ description: { baseValue: 'Texte de mon office', values: { fr: 'Texte de mon office' } } }));
    translate.mockResolvedValue({ description: 'My office text' });
    render(<Harness initial={initial} permissions={bothLayers} />);
    fireEvent.click(screen.getByText('Personnalisée'));
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Traduire avec l’IA' }));
    await waitFor(() => expect(screen.getByLabelText(/^Descriptif/)).toHaveValue('My office text'));
    expect(state.draft.descriptions.orgOverlay?.description.values.en).toBe('My office text');
    expect(state.draft.descriptions.object).toEqual(initial.descriptions.object);
  });

  it('discards a pending translation if the user types in the target field', async () => {
    let finish!: (result: Record<string, string>) => void;
    translate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<Harness initial={modules()} />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Traduire avec l’IA' }));
    fireEvent.change(screen.getByLabelText(/^Descriptif/), { target: { value: 'Typed by hand' } });
    await act(async () => finish({ description: 'Late AI response' }));
    expect(screen.getByLabelText(/^Descriptif/)).toHaveValue('Typed by hand');
    expect(state.draft.descriptions.object.description.values.en).toBe('Typed by hand');
  });

  it('does not offer translation for a read-only scope', () => {
    const permissions = { descriptions: { canEditCanonical: false, canEditOrgEnrichment: false } } as unknown as ObjectWorkspacePermissions;
    render(<Harness initial={modules()} permissions={permissions} />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.queryByRole('button', { name: 'Traduire avec l’IA' })).not.toBeInTheDocument();
  });

  it('hides AI copy and the translation control when the service is unavailable', () => {
    const { useServiceAvailability } = jest.requireMock('../../../hooks/useServiceAvailability') as { useServiceAvailability: jest.Mock };
    useServiceAvailability.mockReturnValue({ translation: false, imageAnalysis: false, email: false });
    render(<Harness initial={modules()} />);
    expect(screen.queryByText(/traduire vos textes en un clic avec l’IA/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.queryByRole('button', { name: 'Traduire avec l’IA' })).not.toBeInTheDocument();
  });
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
    fireEvent.change(screen.getByLabelText(/^Accroche/), { target: { value: 'Nouvelle accroche' } });
    expect(result.current.dirtySections.descriptions).toBe(true);
  });

  it('shows the org scope tab and edits the overlay when enrichment is allowed', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules(scope())));
    render(<SectionDescriptions editor={result.current} permissions={bothLayers} />);
    fireEvent.click(screen.getByText(/Personnalis/));
    // Field has no htmlFor association — select Accroche via data-testid.
    const accroche = screen.getByLabelText(/^Accroche/) as HTMLTextAreaElement;
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
