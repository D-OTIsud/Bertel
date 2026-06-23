import { render, screen } from '@testing-library/react';
import { MapLegend } from './MapLegend';

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
});
