import type { CSSProperties, ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MapPanel } from './MapPanel';
import { useExplorerMapPreviewStore } from '../../store/explorer-map-preview-store';
import { useExplorerStore } from '../../store/explorer-store';
import type { ObjectCard } from '../../types/domain';

const mockEaseTo = jest.fn();
const mockFitBounds = jest.fn();
let mockClustered = false;

jest.mock('react-map-gl/maplibre', () => {
  const React = require('react') as typeof import('react');
  return {
    Map: React.forwardRef(function MockMap({ children }: { children: ReactNode }, ref) {
      React.useImperativeHandle(ref, () => ({
        getMap: () => ({ easeTo: mockEaseTo, fitBounds: mockFitBounds }),
        easeTo: mockEaseTo,
      }));
      return <div data-testid="map-surface">{children}</div>;
    }),
    Marker: ({ children, longitude, latitude, style }: {
      children: ReactNode;
      longitude: number;
      latitude: number;
      style?: CSSProperties;
    }) => <div data-testid="map-marker" data-longitude={longitude} data-latitude={latitude} style={style}>{children}</div>,
    Popup: ({ children, longitude, latitude, focusAfterOpen }: {
      children: ReactNode;
      longitude: number;
      latitude: number;
      focusAfterOpen?: boolean;
    }) => <div data-testid="map-popup" data-longitude={longitude} data-latitude={latitude} data-focus-after-open={String(focusAfterOpen)}>{children}</div>,
    Source: ({ children }: { children: ReactNode }) => <>{children}</>,
    Layer: () => null,
    NavigationControl: () => null,
  };
});

jest.mock('use-supercluster', () => ({
  __esModule: true,
  default: ({ points }: { points: unknown[] }) => ({
    clusters: mockClustered ? [{
      type: 'Feature',
      id: 1,
      properties: { cluster: true, point_count: 2, typeCounts: { HLO: 2 } },
      geometry: { type: 'Point', coordinates: [55.5, -21.1] },
    }] : points,
    supercluster: { getClusterExpansionZoom: () => 13 },
  }),
}));

jest.mock('../../hooks/useItiTracks', () => ({ useItiTracks: () => ({ tracks: [], isLoading: false }) }));
jest.mock('./MapLegend', () => ({ MapLegend: () => null }));
jest.mock('./SelectionBar', () => ({ SelectionBar: () => null }));

function makeCard(id: string, overrides: Partial<ObjectCard> = {}): ObjectCard {
  return {
    id,
    type: 'HLO',
    name: `Lieu ${id}`,
    open_now: true,
    location: { city: 'Entre-Deux', lat: -21.2, lon: 55.4 },
    labels: [],
    tagChips: [],
    ...overrides,
  } as ObjectCard;
}

const alpha = makeCard('alpha');
const beta = makeCard('beta', { location: { city: 'Saint-Pierre', lat: -21.3, lon: 55.5 } });

function preview(card: ObjectCard, source: 'hover' | 'selection' = 'hover') {
  act(() => useExplorerMapPreviewStore.getState().showPreview(card, source));
}

function popupFor(card: ObjectCard) {
  return screen.queryByRole('button', { name: `Ouvrir la fiche ${card.name}` });
}

describe('MapPanel — prévisualisation depuis les résultats', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockClustered = false;
    mockEaseTo.mockClear();
    mockFitBounds.mockClear();
    useExplorerMapPreviewStore.getState().clearPreview();
    useExplorerStore.setState({ selectedObjectIds: [], selectedCardId: null, hoveredCardId: null });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('ouvre immédiatement la prévisualisation demandée et distingue un seul marqueur sans déplacer la caméra', () => {
    render(<MapPanel objects={[alpha, beta]} />);

    preview(alpha);

    expect(popupFor(alpha)).toBeInTheDocument();
    const pin = screen.getByRole('button', { name: `Ouvrir ${alpha.name}` });
    expect(pin).toHaveClass('map-marker-pin--active');
    expect(screen.getAllByRole('button', { name: `Ouvrir ${alpha.name}` })).toHaveLength(1);
    expect(screen.getByTestId('map-popup')).toHaveAttribute('data-longitude', '55.4');
    expect(screen.getByTestId('map-popup')).toHaveAttribute('data-latitude', '-21.2');
    expect(screen.getByTestId('map-popup')).toHaveAttribute('data-focus-after-open', 'false');
    expect(mockEaseTo).not.toHaveBeenCalled();
    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  it('rend le marqueur observé même lorsque les résultats sont regroupés dans un cluster', () => {
    mockClustered = true;
    render(<MapPanel objects={[alpha, beta]} />);
    expect(screen.queryByRole('button', { name: `Ouvrir ${alpha.name}` })).not.toBeInTheDocument();

    preview(alpha);

    expect(popupFor(alpha)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Ouvrir ${alpha.name}` })).toHaveClass('map-marker-pin--active');
    expect(screen.getAllByRole('button', { name: `Ouvrir ${alpha.name}` })).toHaveLength(1);
    expect(mockEaseTo).not.toHaveBeenCalled();
  });

  it('attend les marqueurs chargés après une demande de prévisualisation', () => {
    const { rerender } = render(<MapPanel objects={[]} />);

    preview(alpha, 'selection');

    expect(popupFor(alpha)).not.toBeInTheDocument();
    expect(useExplorerMapPreviewStore.getState().preview?.card.id).toBe(alpha.id);

    rerender(<MapPanel objects={[alpha]} />);

    expect(popupFor(alpha)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Ouvrir ${alpha.name}` })).toHaveClass('map-marker-pin--active');
  });

  it('remplace la fiche prévisualisée et réserve la mise en évidence au marqueur actif', () => {
    render(<MapPanel objects={[alpha, beta]} />);
    preview(alpha);

    preview(beta, 'selection');

    expect(popupFor(alpha)).not.toBeInTheDocument();
    expect(popupFor(beta)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Ouvrir ${alpha.name}` })).not.toHaveClass('map-marker-pin--active');
    expect(screen.getByRole('button', { name: `Ouvrir ${beta.name}` })).toHaveClass('map-marker-pin--active');
  });

  it('ferme la prévisualisation avec Échap et permet de rouvrir la même fiche', () => {
    render(<MapPanel objects={[alpha]} />);
    preview(alpha, 'selection');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(popupFor(alpha)).not.toBeInTheDocument();
    expect(useExplorerMapPreviewStore.getState().preview).toBeNull();
    preview(alpha, 'selection');
    expect(popupFor(alpha)).toBeInTheDocument();
  });

  it('conserve l’infobulle au clic intérieur et la ferme au clic extérieur', () => {
    render(<MapPanel objects={[alpha]} />);
    preview(alpha);

    fireEvent.pointerDown(popupFor(alpha)!);
    expect(popupFor(alpha)).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(popupFor(alpha)).not.toBeInTheDocument();
    expect(useExplorerMapPreviewStore.getState().preview).toBeNull();
  });

  it('ignore les fiches sans coordonnées au lieu de créer une infobulle ou un faux marqueur', () => {
    const unlocated = makeCard('sans-coordonnees', { location: { city: 'Entre-Deux' } });
    render(<MapPanel objects={[alpha, unlocated]} />);

    preview(unlocated);

    expect(popupFor(unlocated)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Ouvrir ${unlocated.name}` })).not.toBeInTheDocument();
  });

  it('réouvre immédiatement la même fiche lorsqu’une nouvelle action de sélection la demande', () => {
    render(<MapPanel objects={[alpha]} />);
    preview(alpha);
    fireEvent.pointerDown(document.body);
    expect(popupFor(alpha)).not.toBeInTheDocument();

    preview(alpha, 'selection');

    expect(popupFor(alpha)).toBeInTheDocument();
  });

  it('ferme une prévisualisation quand sa fiche disparaît des résultats filtrés', () => {
    const { rerender } = render(<MapPanel objects={[alpha, beta]} />);
    preview(alpha, 'selection');

    rerender(<MapPanel objects={[beta]} />);

    expect(popupFor(alpha)).not.toBeInTheDocument();
    expect(useExplorerMapPreviewStore.getState().preview).toBeNull();
    expect(screen.queryByRole('button', { name: `Ouvrir ${alpha.name}` })).not.toBeInTheDocument();
  });

  it('préserve l’accès clavier à l’infobulle et le retour au marqueur après Échap', () => {
    render(<MapPanel objects={[alpha]} />);
    act(() => screen.getByRole('button', { name: `Ouvrir ${alpha.name}` }).focus());

    act(() => jest.advanceTimersByTime(250));

    expect(popupFor(alpha)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Ouvrir ${alpha.name}` })).toHaveFocus();
    act(() => jest.advanceTimersByTime(16));
    expect(popupFor(alpha)).toHaveFocus();

    fireEvent.keyDown(popupFor(alpha)!, { key: 'Escape' });

    expect(popupFor(alpha)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Ouvrir ${alpha.name}` })).toHaveFocus();
    act(() => jest.advanceTimersByTime(1000));
    expect(popupFor(alpha)).not.toBeInTheDocument();
  });

  it('ne transfère pas le focus vers une prévisualisation demandée depuis les résultats', () => {
    render(<><input aria-label="Recherche" /><MapPanel objects={[alpha, beta]} /></>);
    act(() => screen.getByRole('textbox', { name: 'Recherche' }).focus());

    preview(alpha);
    act(() => jest.advanceTimersByTime(500));

    expect(popupFor(alpha)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Recherche' })).toHaveFocus();
  });

  it('annule un transfert clavier en attente lorsqu’une prévisualisation de résultat le remplace', () => {
    render(<MapPanel objects={[alpha, beta]} />);
    act(() => screen.getByRole('button', { name: `Ouvrir ${alpha.name}` }).focus());
    act(() => jest.advanceTimersByTime(250));

    preview(beta);
    act(() => jest.advanceTimersByTime(32));

    expect(popupFor(beta)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Ouvrir ${alpha.name}` })).toHaveFocus();
  });

  it('conserve le callback compact et la restauration du focus après fermeture de la fiche mobile', () => {
    const onCompactMarkerSelect = jest.fn();
    render(<><input aria-label="Autre contrôle" /><MapPanel objects={[alpha]} onCompactMarkerSelect={onCompactMarkerSelect} /></>);

    fireEvent.click(screen.getByRole('button', { name: `Ouvrir ${alpha.name}` }));

    expect(onCompactMarkerSelect).toHaveBeenCalledWith(alpha.id, expect.any(Function));
    expect(popupFor(alpha)).not.toBeInTheDocument();
    act(() => screen.getByRole('textbox', { name: 'Autre contrôle' }).focus());
    act(() => expect(onCompactMarkerSelect.mock.calls[0][1]()).toBe(true));
    expect(screen.getByRole('button', { name: `Ouvrir ${alpha.name}` })).toHaveFocus();
    act(() => jest.advanceTimersByTime(500));
    expect(popupFor(alpha)).not.toBeInTheDocument();
  });

  it('préserve le délai de survol des marqueurs et laisse le temps de rejoindre leur infobulle', () => {
    render(<MapPanel objects={[alpha]} />);
    const pin = screen.getByRole('button', { name: `Ouvrir ${alpha.name}` });

    fireEvent.pointerEnter(pin);
    act(() => jest.advanceTimersByTime(249));
    expect(popupFor(alpha)).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1));
    expect(popupFor(alpha)).toBeInTheDocument();

    // The active marker may be promoted out of the clustered marker collection.
    fireEvent.pointerLeave(screen.getByRole('button', { name: `Ouvrir ${alpha.name}` }));
    act(() => jest.advanceTimersByTime(2999));
    expect(popupFor(alpha)).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1));
    expect(popupFor(alpha)).not.toBeInTheDocument();
  });
});
