import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ItineraryHeroMap } from './ItineraryHeroMap';
import type { ItineraryStageRow } from './itinerary-stages';

const mockFitBounds = jest.fn();
let mockMapOnLoad: (() => void) | undefined;

jest.mock('react-map-gl/maplibre', () => {
  const React = require('react') as typeof import('react');
  return {
    Map: React.forwardRef(function FakeMap({ children, onLoad }: { children?: ReactNode; onLoad?: () => void }, ref) {
      React.useImperativeHandle(ref, () => ({ fitBounds: mockFitBounds }));
      mockMapOnLoad = onLoad;
      return <div data-testid="itinerary-map">{children}</div>;
    }),
    Marker: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Source: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Layer: () => null,
    NavigationControl: () => null,
    AttributionControl: () => <details open className="maplibregl-ctrl-attrib maplibregl-compact-show">
      <summary>Attribution de la carte</summary><a href="https://example.com/map-source">Source cartographique</a>
    </details>,
  };
});

const stages: ItineraryStageRow[] = [
  {
    key: 'start', anchorId: 'stage-start', name: 'Belvédère', positionLabel: 'Étape 1', kindLabel: 'Départ',
    description: 'Départ du parcours.', descriptionMd: '', coordinates: [55.4, -21.1],
    photos: [{ id: 'landscape', url: 'https://example.com/landscape.jpg', title: 'Paysage', description: 'Vue du belvédère' }],
  },
  {
    key: 'waterfall', anchorId: 'stage-waterfall', name: 'Cascade', positionLabel: 'Étape 2', kindLabel: '',
    description: 'Texte aplati.', descriptionMd: 'Observer **la cascade** et consulter [le descriptif](https://example.com/cascade).',
    coordinates: [55.5, -21.2],
    photos: [
      { id: 'waterfall', url: 'https://example.com/waterfall.jpg', title: 'Chute d’eau', description: 'Cascade dans la végétation', credit: 'Office de tourisme' },
      { id: 'forest', url: 'https://example.com/forest.jpg', title: 'Sous-bois', description: 'Sentier dans la forêt' },
    ],
  },
  {
    key: 'return', anchorId: 'stage-return', name: 'Retour', positionLabel: 'Étape 3', kindLabel: 'Retour',
    description: 'Dernière étape du parcours.', descriptionMd: '', coordinates: [55.6, -21.3], photos: [],
  },
];

function renderMap(rows = stages) {
  return render(<ItineraryHeroMap name="Parcours de démonstration" track={{ type: 'LineString', coordinates: [[55.3, -21.4], [55.7, -21]] }}
    stages={rows} location={null} />);
}

function selectedCard() {
  return screen.getByRole('article', { name: 'Détail de l’étape sélectionnée' });
}

function marker(number: number, name: string) {
  return screen.getByRole('button', { name: `Étape ${number} : ${name}` });
}

function listButton(number: number, name: string) {
  return screen.getByRole('button', { name: `Sélectionner l’étape ${number} : ${name}` });
}

function rect(top: number, bottom: number, height = bottom - top): DOMRect {
  return { x: 0, y: top, top, bottom, left: 0, right: 700, width: 700, height, toJSON: () => ({}) };
}

describe('ItineraryHeroMap interactions', () => {
  beforeEach(() => {
    mockFitBounds.mockClear();
    mockMapOnLoad = undefined;
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the map free of the removed footer and hint while retaining collapsed attribution', () => {
    renderMap();
    expect(screen.queryByText(/Tracé du sentier|Tracé non renseigné|Parcours en boucle/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voir les photos/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Sélectionnez un repère ou une étape')).not.toBeInTheDocument();
    const attribution = screen.getByText('Attribution de la carte').closest('details')!;
    expect(attribution).toHaveAttribute('open');
    expect(mockMapOnLoad).toBeDefined();
    mockMapOnLoad!();
    expect(attribution).not.toHaveAttribute('open');
    expect(attribution).not.toHaveClass('maplibregl-compact-show');
    expect(screen.getByText('Attribution de la carte')).toBeInTheDocument();
  });

  it('keeps markers, list buttons and the selected card in sync in both directions', () => {
    renderMap();
    expect(marker(1, 'Belvédère')).toHaveAttribute('aria-pressed', 'true');
    expect(listButton(1, 'Belvédère')).toHaveAttribute('aria-pressed', 'true');
    expect(within(selectedCard()).getByRole('heading', { name: 'Belvédère' })).toBeVisible();

    fireEvent.click(listButton(2, 'Cascade'));
    expect(marker(2, 'Cascade')).toHaveAttribute('aria-pressed', 'true');
    expect(listButton(2, 'Cascade')).toHaveAttribute('aria-pressed', 'true');
    expect(marker(1, 'Belvédère')).toHaveAttribute('aria-pressed', 'false');
    expect(listButton(1, 'Belvédère')).toHaveAttribute('aria-pressed', 'false');
    expect(within(selectedCard()).getByRole('heading', { name: 'Cascade' })).toBeVisible();

    fireEvent.click(marker(3, 'Retour'));
    expect(marker(3, 'Retour')).toHaveAttribute('aria-pressed', 'true');
    expect(listButton(3, 'Retour')).toHaveAttribute('aria-pressed', 'true');
    expect(listButton(3, 'Retour')).toHaveFocus();
    expect(listButton(2, 'Cascade')).toHaveAttribute('aria-pressed', 'false');
    expect(within(selectedCard()).getByRole('heading', { name: 'Retour' })).toBeVisible();
  });

  it('opens only the selected stage photos and navigates both photos by button and keyboard', async () => {
    renderMap();
    fireEvent.click(listButton(2, 'Cascade'));
    const card = selectedCard();
    expect(within(card).getByRole('img', { name: 'Cascade dans la végétation' })).toHaveAttribute('src', 'https://example.com/waterfall.jpg');
    expect(within(card).getByText('2 photos')).toBeVisible();
    fireEvent.click(within(card).getByRole('button', { name: 'Agrandir les photos de cette étape' }));

    const gallery = await screen.findByRole('dialog', { name: 'Galerie photo de Cascade' });
    expect(within(gallery).getAllByRole('img')[0]).toHaveAttribute('src', 'https://example.com/waterfall.jpg');
    expect(within(gallery).getByText('Photo Office de tourisme')).toBeVisible();
    expect(within(gallery).queryByRole('img', { name: 'Vue du belvédère' })).not.toBeInTheDocument();
    fireEvent.click(within(gallery).getByRole('button', { name: 'Image suivante dans la galerie' }));
    expect(within(gallery).getAllByRole('img')[0]).toHaveAttribute('src', 'https://example.com/forest.jpg');
    fireEvent.keyDown(gallery, { key: 'ArrowLeft' });
    expect(within(gallery).getAllByRole('img')[0]).toHaveAttribute('src', 'https://example.com/waterfall.jpg');
    fireEvent.keyDown(gallery, { key: 'ArrowLeft' });
    expect(within(gallery).getAllByRole('img')[0]).toHaveAttribute('src', 'https://example.com/forest.jpg');
  });

  it('retains formatted Markdown in the list, selected card and photo gallery', async () => {
    renderMap();
    fireEvent.click(listButton(2, 'Cascade'));
    const list = screen.getByRole('list');
    const card = selectedCard();
    for (const scope of [list, card]) {
      expect(within(scope).getByText('la cascade').tagName).toBe('STRONG');
      expect(within(scope).getByRole('link', { name: 'le descriptif' })).toHaveAttribute('href', 'https://example.com/cascade');
      expect(within(scope).queryByText('Texte aplati.')).not.toBeInTheDocument();
    }
    fireEvent.click(within(card).getByRole('button', { name: 'Agrandir les photos de cette étape' }));
    const gallery = await screen.findByRole('dialog');
    expect(within(gallery).getByText('la cascade').tagName).toBe('STRONG');
    expect(within(gallery).getByRole('link', { name: 'le descriptif' })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows a text-only stage without an empty photo message and reopens it after closing', () => {
    renderMap();
    fireEvent.click(listButton(3, 'Retour'));
    const card = selectedCard();
    expect(within(card).getByText('Dernière étape du parcours.')).toBeVisible();
    expect(within(card).queryByRole('img')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Agrandir les photos de cette étape' })).not.toBeInTheDocument();
    expect(card).not.toHaveTextContent(/aucune photo|pas de photo|sans photo/i);
    fireEvent.click(within(card).getByRole('button', { name: 'Fermer la carte de l’étape' }));
    expect(screen.queryByRole('article', { name: 'Détail de l’étape sélectionnée' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tout le parcours' })).toHaveFocus();

    fireEvent.click(marker(3, 'Retour'));
    expect(within(selectedCard()).getByRole('heading', { name: 'Retour' })).toBeVisible();
    expect(listButton(3, 'Retour')).toHaveFocus();
  });

  it('returns focus to the stage photo after closing its gallery and starts at its first photo when reopened', async () => {
    renderMap();
    fireEvent.click(listButton(2, 'Cascade'));
    const openPhotos = within(selectedCard()).getByRole('button', { name: 'Agrandir les photos de cette étape' });
    openPhotos.focus();
    fireEvent.click(openPhotos);
    const gallery = await screen.findByRole('dialog');
    fireEvent.click(within(gallery).getByRole('button', { name: 'Image suivante dans la galerie' }));
    fireEvent.click(within(gallery).getByRole('button', { name: 'Fermer la galerie' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(openPhotos).toHaveFocus());
    fireEvent.click(openPhotos);
    const reopened = await screen.findByRole('dialog');
    expect(within(reopened).getAllByRole('img')[0]).toHaveAttribute('src', 'https://example.com/waterfall.jpg');
  });

  it('scrolls a long desktop list internally and focuses its selected step without scrolling the outer page', () => {
    const longStages = Array.from({ length: 12 }, (_, index) => ({
      ...stages[2], key: `long-${index}`, anchorId: `stage-long-${index}`, name: `Passage ${index + 1}`, positionLabel: `Étape ${index + 1}`,
    }));
    renderMap(longStages);
    const list = screen.getByRole('list');
    list.style.overflowY = 'auto';
    list.scrollTop = 100;
    jest.spyOn(list, 'getBoundingClientRect').mockReturnValue(rect(100, 400));
    const target = document.getElementById('stage-long-11')!;
    jest.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(600, 650));
    fireEvent.click(marker(12, 'Passage 12'));
    expect(list.scrollTop).toBe(350);
    expect(listButton(12, 'Passage 12')).toHaveFocus();
    expect(listButton(12, 'Passage 12')).toHaveAttribute('aria-pressed', 'true');
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('fits the full route above the selected card and restores normal padding when the card closes', () => {
    jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('aria-label') === 'Carte du sentier' ? 440 : 0;
    });
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.tagName === 'ARTICLE' ? rect(0, 180) : rect(0, 0);
    });
    renderMap();
    fireEvent.click(screen.getByRole('button', { name: 'Tout le parcours' }));
    expect(mockFitBounds).toHaveBeenLastCalledWith([55.3, -21.4, 55.7, -21], {
      padding: { top: 58, right: 58, bottom: 212, left: 42 }, maxZoom: 15, duration: 0,
    });
    fireEvent.click(within(selectedCard()).getByRole('button', { name: 'Fermer la carte de l’étape' }));
    expect(mockFitBounds).toHaveBeenLastCalledWith([55.3, -21.4, 55.7, -21], {
      padding: { top: 58, right: 58, bottom: 58, left: 42 }, maxZoom: 15, duration: 0,
    });
  });
});
