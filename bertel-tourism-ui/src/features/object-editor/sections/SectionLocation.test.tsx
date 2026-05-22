import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, renderHook } from '@testing-library/react';

jest.mock('../../../hooks/useExplorerQueries', () => ({
  useLocationReferenceOptionsQuery: () => ({
    data: { lieuDits: ['Bras-Long', 'Centre Ville', 'La Plaine des Cafres'] },
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('react-map-gl/maplibre', () => ({
  Map: ({ children, onClick }: { children?: ReactNode; onClick?: (e: { lngLat: { lat: number; lng: number } }) => void }) => (
    <button type="button" data-testid="location-pin-map" onClick={() => onClick?.({ lngLat: { lat: -21.2, lng: 55.5 } })}>
      {children}
    </button>
  ),
  Marker: ({ children }: { children?: ReactNode }) => <div data-testid="location-pin-marker">{children}</div>,
  NavigationControl: () => null,
}));
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionLocation } from './SectionLocation';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

const perms = {} as ObjectWorkspacePermissions;

function modules(): ObjectWorkspaceModules {
  return {
    generalInfo: { name: 'A', commercialVisibility: 'full' },
    location: {
      main: {
        recordId: null,
        address1: '38 Chemin du Bel Air',
        address1Suite: '',
        address2: '',
        address3: '',
        postcode: '97414',
        city: "L'Entre-Deux",
        codeInsee: '',
        lieuDit: 'Bras-Long',
        direction: '',
        latitude: '',
        longitude: '',
        zoneTouristique: '',
      },
      places: [],
      zoneCodes: [],
    },
    publication: {
      status: 'published',
      publishedAt: '',
      isEditing: true,
      moderation: {
        availability: 'available',
        pendingCount: 1,
        unavailableReason: null,
        items: [
          {
            id: 'chg-demo-lieudit',
            targetTable: 'object_location',
            action: 'update',
            status: 'pending',
            submittedAt: '2026-03-12',
            reviewedAt: '',
            appliedAt: '',
            reviewNote: '',
            summary: 'lieu_dit · Bras-Long -> Bras Long',
            field: 'lieu_dit',
            beforeValue: 'Bras-Long',
            afterValue: 'Bras Long',
            submittedByLabel: 'Jean Martin · Prestataire',
          },
        ],
      },
      printPublications: { availability: 'available', selectionCount: 0, unavailableReason: null, items: [] },
    },
  } as unknown as ObjectWorkspaceModules;
}

describe('SectionLocation', () => {
  it('renders the address into the controlled field', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionLocation editor={result.current} permissions={perms} />);
    expect(screen.getByDisplayValue('38 Chemin du Bel Air')).toBeInTheDocument();
  });

  it('shows pending lieu-dit review with validate action', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionLocation editor={result.current} permissions={perms} />);
    expect(screen.getByText('Bras-Long')).toHaveClass('pending-value--current');
    expect(screen.getByText('Bras Long')).toHaveClass('pending-value--proposed');
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument();
  });

  it('asks for confirmation before committing coordinates from the map', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionLocation editor={result.current} permissions={perms} />);
    act(() => {
      fireEvent.click(screen.getByTestId('location-pin-map'));
    });
    expect(result.current.draft.location.main.latitude).toBe('');
    expect(screen.getByRole('group', { name: 'Confirmer le déplacement du repère GPS' })).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Oui' }));
    });
    expect(result.current.draft.location.main.latitude).toBe('-21.200000');
    expect(result.current.draft.location.main.longitude).toBe('55.500000');
  });

  it('reverts a pending map move when the user declines', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionLocation editor={result.current} permissions={perms} />);
    act(() => {
      fireEvent.click(screen.getByTestId('location-pin-map'));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Non' }));
    });
    expect(result.current.draft.location.main.latitude).toBe('');
    expect(screen.queryByRole('group', { name: 'Confirmer le déplacement du repère GPS' })).not.toBeInTheDocument();
  });

  it('formats address on blur', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionLocation editor={result.current} permissions={perms} />);
    const address = screen.getByDisplayValue('38 Chemin du Bel Air');
    fireEvent.change(address, { target: { value: '12 rue de la gare' } });
    fireEvent.blur(address);
    expect(result.current.draft.location.main.address1).toBe('12 Rue de la Gare');
  });

  it('uses a combobox for lieu-dit with corpus suggestions', () => {
    const base = modules();
    base.publication.moderation = {
      availability: 'available',
      pendingCount: 0,
      unavailableReason: null,
      items: [],
    };
    const { result } = renderHook(() => useObjectEditorState('o1', base));
    render(<SectionLocation editor={result.current} permissions={perms} />);
    const lieuDit = screen.getByRole('combobox', { name: 'Lieu-dit' });
    fireEvent.change(lieuDit, { target: { value: 'centre' } });
    fireEvent.click(screen.getByRole('option', { name: 'Centre Ville' }));
    expect(result.current.draft.location.main.lieuDit).toBe('Centre Ville');
  });

  it('does not surface object_zone commune codes (itinerary-only concern)', () => {
    const base = modules();
    base.location.zoneCodes = ['97416'];
    const { result } = renderHook(() => useObjectEditorState('o1', base));
    render(<SectionLocation editor={result.current} permissions={perms} />);
    expect(screen.queryByText('Communes associées')).not.toBeInTheDocument();
    expect(screen.queryByText('97416')).not.toBeInTheDocument();
  });
});
