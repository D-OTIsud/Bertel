import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import OtiMapRecap from './OtiMapRecap';
import type { OtiPoi } from './OtiTemplate';

// Captured Map props so the tests can trigger onLoad/onIdle with a fake maplibre map.
let mockMapProps: Record<string, unknown> = {};

jest.mock('react-map-gl/maplibre', () => ({
  Map: (props: { children?: ReactNode }) => {
    mockMapProps = props as Record<string, unknown>;
    return <div data-testid="map">{props.children}</div>;
  },
  Marker: ({ children }: { children?: ReactNode }) => <div data-testid="oti-marker">{children}</div>,
  NavigationControl: () => null,
}));

function poi(id: string, lat: number | null, lon: number | null): OtiPoi {
  return {
    id,
    name: `Lieu ${id}`,
    typeCode: 'HOT',
    city: null,
    image: null,
    subtitle: null,
    note: null,
    lat,
    lon,
    phone: null,
    web: null,
  };
}

const pois = [poi('a', -21.1, 55.5), poi('b', null, null), poi('c', -21.3, 55.7)];

describe('OtiMapRecap', () => {
  beforeEach(() => {
    mockMapProps = {};
  });

  it('renders one numbered marker per located poi — numbers match the cards below', () => {
    render(<OtiMapRecap pois={pois} lang="fr" />);
    const markers = screen.getAllByTestId('oti-marker');
    expect(markers).toHaveLength(2);
    expect(markers[0]).toHaveTextContent('1');
    // 'b' has no coords → no pin, 'c' keeps its card number 3
    expect(markers[1]).toHaveTextContent('3');
  });

  it('fits the map to the located pois on load', () => {
    render(<OtiMapRecap pois={pois} lang="fr" />);
    const fitBounds = jest.fn();
    act(() => {
      (mockMapProps.onLoad as (e: unknown) => void)({ target: { fitBounds } });
    });
    expect(fitBounds).toHaveBeenCalledWith(
      [
        [55.5, -21.3],
        [55.7, -21.1],
      ],
      expect.objectContaining({ maxZoom: expect.any(Number) }),
    );
  });

  it('captures a print snapshot on idle: print-only img + projected pins + onSnapshot', async () => {
    const onSnapshot = jest.fn();
    const { container } = render(<OtiMapRecap pois={pois} lang="fr" onSnapshot={onSnapshot} />);
    const fakeMap = {
      getCanvas: () => ({ toDataURL: () => 'data:image/jpeg;base64,SHOT' }),
      getContainer: () => ({ getBoundingClientRect: () => ({ width: 800, height: 400 }) }),
      project: ([lon]: [number, number]) => (lon === 55.5 ? { x: 200, y: 100 } : { x: 600, y: 300 }),
    };
    act(() => {
      (mockMapProps.onIdle as (e: unknown) => void)({ target: fakeMap });
    });
    await waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    expect(onSnapshot.mock.calls.at(-1)?.[0]).toEqual({
      url: 'data:image/jpeg;base64,SHOT',
      pins: [
        { n: 1, xPct: 25, yPct: 25 },
        { n: 3, xPct: 75, yPct: 75 },
      ],
    });
    const img = container.querySelector('.oti-map__printshot img');
    expect(img?.getAttribute('src')).toBe('data:image/jpeg;base64,SHOT');
    // pins re-overlaid on the shot (canvas snapshots don't contain DOM markers)
    expect(container.querySelectorAll('.oti-map__printshot .oti-map__pin')).toHaveLength(2);
  });

  it('shows the caption and the OSM attribution (public/print outward-facing surfaces)', () => {
    render(<OtiMapRecap pois={pois} lang="fr" />);
    expect(screen.getByText('Votre parcours')).toBeInTheDocument();
    expect(screen.getByText('© OpenStreetMap')).toBeInTheDocument();
  });

  it('renders nothing when no poi has coordinates (parent falls back to the decorative block)', () => {
    const { container } = render(<OtiMapRecap pois={[poi('a', null, null)]} lang="fr" />);
    expect(container.firstChild).toBeNull();
  });
});
