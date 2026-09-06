import { render, screen } from '@testing-library/react';

import { BarSeriesChart } from './BarSeriesChart';

const SEMAINES = [
  { label: '15 juin', values: [1, 0] },
  { label: '22 juin', values: [1, 1] },
  { label: '29 juin', values: [2, 0] },
  { label: '6 juil.', values: [0, 0] },
  { label: '13 juil.', values: [2, 0] },
  { label: '20 juil.', values: [3, 0] },
];

describe('BarSeriesChart', () => {
  it('rend une barre par série et par point, et les annonce comme une image légendée', () => {
    render(
      <BarSeriesChart
        bars={SEMAINES}
        series={[{ key: 'jours', label: 'Jours de saisie', color: 'var(--teal)' }, { key: 'creees', label: 'Fiches créées', color: 'var(--warn)' }]}
        ariaLabel="Jours de saisie et fiches créées par semaine sur 12 semaines"
      />,
    );
    const svg = screen.getByRole('img', { name: /jours de saisie et fiches créées/i });
    expect(svg.querySelectorAll('rect.bar-series__bar')).toHaveLength(SEMAINES.length * 2);
  });

  it('l’axe part de ZÉRO — une valeur de 1 ne doit pas être écrasée par une valeur de 3', () => {
    // C'est la raison d'être de ce composant : `TimeseriesChart` recule sa borne basse de
    // 45 % de l'amplitude, ce qui convient à la complétude (92,3 → 91,4) mais rendrait ici
    // une semaine à 1 quasi invisible à côté d'une semaine à 3. Sur des COMPTES, un axe qui
    // ne part pas de zéro ment sur les proportions.
    render(
      <BarSeriesChart
        bars={[{ label: 'a', values: [1] }, { label: 'b', values: [3] }]}
        series={[{ key: 'v', label: 'Valeur', color: 'var(--teal)' }]}
        ariaLabel="test"
      />,
    );
    const rects = [...screen.getByRole('img').querySelectorAll('rect.bar-series__bar')];
    const h = rects.map((r) => Number(r.getAttribute('height')));
    // Un axe partant de zéro donne un rapport de hauteurs égal au rapport des valeurs.
    expect(h[1] / h[0]).toBeCloseTo(3, 1);
  });

  it('une valeur ZÉRO ne dessine aucune hauteur, mais garde sa place sur l’axe', () => {
    // Une semaine sans travail doit se lire comme un creux, pas comme une absence de donnée.
    render(
      <BarSeriesChart
        bars={[{ label: 'a', values: [0] }, { label: 'b', values: [2] }]}
        series={[{ key: 'v', label: 'Valeur', color: 'var(--teal)' }]}
        ariaLabel="test"
      />,
    );
    const rects = [...screen.getByRole('img').querySelectorAll('rect.bar-series__bar')];
    expect(rects).toHaveLength(2);
    expect(Number(rects[0].getAttribute('height'))).toBe(0);
  });

  it('une série entièrement à zéro ne divise pas par zéro', () => {
    render(
      <BarSeriesChart
        bars={[{ label: 'a', values: [0] }, { label: 'b', values: [0] }]}
        series={[{ key: 'v', label: 'Valeur', color: 'var(--teal)' }]}
        ariaLabel="test"
      />,
    );
    const rects = [...screen.getByRole('img').querySelectorAll('rect.bar-series__bar')];
    expect(rects.every((r) => Number.isFinite(Number(r.getAttribute('height'))))).toBe(true);
  });

  it('sans aucun point, le dit au lieu de dessiner un cadre vide', () => {
    render(<BarSeriesChart bars={[]} series={[{ key: 'v', label: 'V', color: 'var(--teal)' }]} ariaLabel="test" emptyLabel="Rien à afficher." />);
    expect(screen.getByText('Rien à afficher.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('chaque barre porte un <title> lisible — la valeur reste atteignable sans la couleur', () => {
    // Les couleurs de série ne sont pas une information accessible : le titre SVG donne le
    // couple (période, série, valeur) au survol comme au lecteur d'écran.
    render(
      <BarSeriesChart
        bars={[{ label: '15 juin', values: [4] }]}
        series={[{ key: 'jours', label: 'Jours de saisie', color: 'var(--teal)' }]}
        ariaLabel="test"
      />,
    );
    expect(screen.getByText('15 juin — Jours de saisie : 4')).toBeInTheDocument();
  });
});
