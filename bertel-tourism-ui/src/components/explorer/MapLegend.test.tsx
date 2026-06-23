import { render, screen } from '@testing-library/react';
import { MapLegend } from './MapLegend';
import { defaultMarkerStyles } from '../../config/map-markers';

describe('MapLegend', () => {
  it('décode les 7 familles d’archétype', () => {
    render(<MapLegend />);
    for (const label of [
      'Hébergement',
      'Restauration',
      'Activité',
      'Itinéraire',
      'Site & visite',
      'Service',
      'Événement',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('porte un libellé accessible de légende', () => {
    render(<MapLegend />);
    expect(screen.getByRole('group', { name: /légende/i })).toBeInTheDocument();
  });

  // Régression : la pastille doit porter le glyphe CANONIQUE du marqueur
  // (defaultMarkerStyles → même source que les PNG de public/markers), pas une
  // icône lucide choisie à la main. Avant correctif : ACT=étoile mais légende
  // "Activity", VIS=caméra mais "Mountain", SRV=bâtiment mais "Store".
  it('reprend le glyphe du marqueur pour chaque famille, dans l’ordre', () => {
    const { container } = render(<MapLegend />);
    const icons = Array.from(container.querySelectorAll('.map-legend__dot')).map((dot) =>
      dot.getAttribute('data-marker-icon'),
    );
    expect(icons).toEqual([
      defaultMarkerStyles.HOT.icon,
      defaultMarkerStyles.RES.icon,
      defaultMarkerStyles.ACT.icon,
      defaultMarkerStyles.ITI.icon,
      defaultMarkerStyles.VIS.icon,
      defaultMarkerStyles.SRV.icon,
      defaultMarkerStyles.EVT.icon,
    ]);
  });

  it('corrige la dérive d’origine ACT/VIS/SRV (étoile, caméra, bâtiment)', () => {
    const { container } = render(<MapLegend />);
    expect(container.querySelector('.map-legend__dot[data-marker-icon="spark"]')).not.toBeNull(); // ACT
    expect(container.querySelector('.map-legend__dot[data-marker-icon="camera"]')).not.toBeNull(); // VIS
    expect(container.querySelector('.map-legend__dot[data-marker-icon="building"]')).not.toBeNull(); // SRV
  });
});
