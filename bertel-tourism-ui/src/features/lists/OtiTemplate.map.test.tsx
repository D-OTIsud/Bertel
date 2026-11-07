import { render, screen } from '@testing-library/react';
import OtiTemplate, { type OtiPoi } from './OtiTemplate';

// Seam: the live map chunk (maplibre) is lazy-loaded through OtiMapRecapLazy — mock it so
// this test only exercises the MapRecap routing (live / static snapshot / honest fallback).
jest.mock('./OtiMapRecapLazy', () => ({
  __esModule: true,
  default: () => <div data-testid="live-map" />,
}));

function poi(id: string, lat: number | null, lon: number | null): OtiPoi {
  return {
    id,
    name: `Lieu ${id}`,
    typeCode: 'HOT',
    city: 'Saint-Pierre',
    image: null,
    subtitle: null,
    note: null,
    lat,
    lon,
    phone: null,
    web: null,
  };
}

function renderTemplate(over: Partial<Parameters<typeof OtiTemplate>[0]> = {}) {
  return render(
    <OtiTemplate
      template="carnet"
      lang="fr"
      accent="teal"
      name="Sélection test"
      items={[poi('a', -21.1, 55.5), poi('b', -21.3, 55.7)]}
      showMap
      {...over}
    />,
  );
}

describe('OtiTemplate — MapRecap routing', () => {
  it('renders the live map when at least one item has coordinates', () => {
    renderTemplate();
    expect(screen.getByTestId('live-map')).toBeInTheDocument();
  });

  it('falls back to the decorative block WITHOUT fake pins when no item has coordinates', () => {
    const { container } = renderTemplate({ items: [poi('a', null, null)] });
    expect(screen.queryByTestId('live-map')).not.toBeInTheDocument();
    expect(container.querySelector('.oti-map')).not.toBeNull();
    // the old hardcoded MAP_POS pins misrepresented geography — they must be gone
    expect(container.querySelectorAll('.oti-map__pin')).toHaveLength(0);
    expect(screen.getByText('Votre parcours')).toBeInTheDocument();
  });

  it('static mode (print portal) renders the snapshot image + projected pins, never the live map', () => {
    const { container } = renderTemplate({
      staticMap: true,
      mapSnapshot: {
        url: 'data:image/jpeg;base64,SHOT',
        pins: [
          { n: 1, xPct: 25, yPct: 40 },
          { n: 2, xPct: 60, yPct: 55 },
        ],
      },
    });
    expect(screen.queryByTestId('live-map')).not.toBeInTheDocument();
    const img = container.querySelector('.oti-map img');
    expect(img?.getAttribute('src')).toBe('data:image/jpeg;base64,SHOT');
    const pins = container.querySelectorAll('.oti-map__pin');
    expect(pins).toHaveLength(2);
    expect((pins[0] as HTMLElement).style.left).toBe('25%');
    expect(pins[1]).toHaveTextContent('2');
  });

  it('static mode without a snapshot yet stays on the honest decorative block', () => {
    const { container } = renderTemplate({ staticMap: true });
    expect(screen.queryByTestId('live-map')).not.toBeInTheDocument();
    expect(container.querySelector('.oti-map')).not.toBeNull();
    expect(container.querySelectorAll('.oti-map__pin')).toHaveLength(0);
  });

  it('renders no map at all when showMap is off', () => {
    const { container } = renderTemplate({ showMap: false });
    expect(screen.queryByTestId('live-map')).not.toBeInTheDocument();
    expect(container.querySelector('.oti-map')).toBeNull();
  });
});
