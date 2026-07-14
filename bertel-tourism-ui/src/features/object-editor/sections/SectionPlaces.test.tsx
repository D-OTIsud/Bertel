import type { ReactElement } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionPlaces } from './SectionPlaces';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

// PlaceEditModal reads location reference options via react-query, so any test that opens
// it must render inside a QueryClientProvider (see section-registry.test.tsx).
function renderSection(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const readOnlyPermissions = new Proxy(
  {},
  {
    get: () => ({
      canDirectWrite: false,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: 'Lecture seule',
      canEditPlaceMedia: false,
      canEditZones: false,
      canEditCanonical: false,
      canEditOrgEnrichment: false,
    }),
  },
) as ObjectWorkspacePermissions;

describe('SectionPlaces — multi-place module', () => {
  it('lists secondary sites and opens the edit modal', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPlaces editor={result.current} permissions={allowAll} archetype="HEB" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Belvédère' })); });
    expect(screen.getByText('Modifier le site')).toBeInTheDocument();
  });

  it('adds a site and marks the places module dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = renderSection(<SectionPlaces editor={result.current} permissions={allowAll} archetype="HEB" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter un site/i })); });
    view.rerender(<SectionPlaces editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(result.current.draft.places.items.length).toBeGreaterThan(1);
    expect(result.current.dirtySections.places).toBe(true);
  });

  it('disables add/remove controls for read-only users', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPlaces editor={result.current} permissions={readOnlyPermissions} archetype="HEB" />);
    expect(screen.queryByRole('button', { name: /Ajouter un site/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Lecture seule/)).toBeInTheDocument();
  });

  it('blocks save on out-of-range coordinates and shows an error', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPlaces editor={result.current} permissions={allowAll} archetype="HEB" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Belvédère' })); });

    // Belvédère's location starts with empty lat/lng (section-fixture.test-utils) — set both so
    // only the range check (not the pairing check) is exercised.
    fireEvent.change(screen.getByPlaceholderText('Latitude'), { target: { value: '200' } });
    fireEvent.change(screen.getByPlaceholderText('Longitude'), { target: { value: '55.4' } });

    expect(screen.getByText(/hors plage/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('toggles a commune and marks the location module dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = renderSection(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Saint-Joseph' })); });
    view.rerender(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    expect(result.current.dirtySections.location).toBe(true);
    expect(result.current.draft.location.zoneCodes).toContain('97412');
  });
});
