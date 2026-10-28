jest.mock('../widgets/LocationPinMap', () => ({ LocationPinMap: () => null }));
jest.mock('../../../components/markdown/MarkdownEditorLazy', () => ({ MarkdownEditorLazy: () => null }));

import type { ReactElement, ReactNode } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionPlaces } from './SectionPlaces';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';
import { buildPlacesRpcPayload } from '../../../services/object-workspace';

// PlaceEditModal reads location reference options via react-query, so any test that opens
// it must render inside a QueryClientProvider (see section-registry.test.tsx).
function renderSection(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(ui, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> });
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
  it('keeps itinerary stages exclusively in the route editor', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    expect(screen.getByText('Territoire traversé')).toBeInTheDocument();
    expect(screen.queryByText("Étapes d'itinéraire")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Belvédère du Maïdo')).not.toBeInTheDocument();
    expect(result.current.draft.itinerary.stages).toHaveLength(1);
  });
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
    expect(result.current.draft.places.items.at(-1)).toMatchObject({ isNew: true, recordId: expect.any(String), descriptionRecordId: expect.any(String) });
    expect(screen.getByText('Ajouter un site secondaire')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled();
  });

  it('confirms a deletion with the site name and affected descendants before changing the draft', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPlaces editor={result.current} permissions={allowAll} archetype="HEB" />);
    const count = result.current.draft.places.items.length;
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(result.current.draft.places.items).toHaveLength(count);
    expect(screen.getByText(/Belvédère.*adresses, descriptions et médias/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(result.current.draft.places.items).toHaveLength(count);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le site' }));
    expect(result.current.draft.places.items).toHaveLength(count - 1);
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
    expect(screen.getByRole('button', { name: 'Appliquer' })).toBeDisabled();
  });

  it('can edit an existing unnamed site without imposing a replacement name', () => {
    const modules = fullModulesFixture();
    modules.places.items[0].label = '';
    modules.places.items[0].rawName = null;
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    renderSection(<SectionPlaces editor={result.current} permissions={allowAll} archetype="HEB" />);
    fireEvent.click(screen.getByRole('button', { name: 'Site 1' }));
    expect(screen.getByRole('button', { name: 'Appliquer' })).toBeEnabled();
  });

  it.each([null, 'private', 'public'])('keeps NULL visibility on apply unless %p is explicitly chosen', (choice) => {
    const modules = fullModulesFixture();
    const place = modules.places.items[0];
    place.recordId = '11111111-1111-4111-8111-111111111111';
    place.location.recordId = '22222222-2222-4222-8222-222222222222';
    place.descriptionRecordId = '33333333-3333-4333-8333-333333333333';
    place.rawVisibility = null;
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    renderSection(<SectionPlaces editor={result.current} permissions={allowAll} archetype="HEB" />);
    fireEvent.click(screen.getByRole('button', { name: 'Belvédère' }));
    const select = screen.getByLabelText('Visibilité de la description');
    expect(select).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Non définie (accès restreint)' })).toBeInTheDocument();
    if (choice) fireEvent.change(select, { target: { value: choice } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    const payload = buildPlacesRpcPayload(result.current.draft.places) as { places: Array<{ descriptions: Array<{ visibility: string | null }> }> };
    expect(payload.places[0].descriptions[0].visibility).toBe(choice);
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
