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

  // Décision §123 : retour aux sujets lucide d'origine de la légende pour les 3
  // types qui avaient divergé — ACT=pouls (activity), VIS=montagne, SRV=boutique.
  // Verrouille les défauts choisis pour qu'un futur changement de catalogue ne les
  // ré-écrase pas silencieusement (légende, pins et cartes lisent cette table).
  it('porte les sujets par défaut ACT/VIS/SRV (pouls, montagne, boutique)', () => {
    const { container } = render(<MapLegend />);
    expect(container.querySelector('.map-legend__dot[data-marker-icon="activity"]')).not.toBeNull(); // ACT
    expect(container.querySelector('.map-legend__dot[data-marker-icon="mountain"]')).not.toBeNull(); // VIS
    expect(container.querySelector('.map-legend__dot[data-marker-icon="store"]')).not.toBeNull(); // SRV
  });
});
