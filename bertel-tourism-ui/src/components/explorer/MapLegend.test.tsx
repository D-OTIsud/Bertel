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

  // Décision §126 : les défauts reprennent les icônes lucide du modal « Créer une
  // fiche » (CreateObjectDialog → ARCHETYPE_VISUAL). Verrouille les 7 sujets pour
  // qu'un futur changement de catalogue ne re-diverge pas du sélecteur de type
  // (légende, pins et cartes lisent cette même table).
  it('reprend les sujets du modal « Créer une fiche » (§126)', () => {
    const { container } = render(<MapLegend />);
    const iconOf = (icon: string) => container.querySelector(`.map-legend__dot[data-marker-icon="${icon}"]`);
    expect(iconOf('bedDouble')).not.toBeNull(); // HEB
    expect(iconOf('utensilsCrossed')).not.toBeNull(); // RES
    expect(iconOf('mountain')).not.toBeNull(); // ASC/ACT
    expect(iconOf('route')).not.toBeNull(); // ITI
    expect(iconOf('landmark')).not.toBeNull(); // VIS
    expect(iconOf('store')).not.toBeNull(); // SRV
    expect(iconOf('partyPopper')).not.toBeNull(); // FMA/EVT
  });
});
