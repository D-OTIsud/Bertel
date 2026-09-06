import { render, screen } from '@testing-library/react';
import { TimeseriesChart } from './TimeseriesChart';
import type { MetricSnapshotPoint } from '../../types/metric-snapshot';

const plate: MetricSnapshotPoint[] = [
  { bucket_date: '2026-06-19', value: 92.3, denominator: 361 },
  { bucket_date: '2026-07-14', value: 91.3, denominator: 839 },
  { bucket_date: '2026-08-30', value: 91.4, denominator: 843 },
];

describe('TimeseriesChart', () => {
  it('trace un point par relevé', () => {
    const { container } = render(<TimeseriesChart points={plate} label="Remplissage moyen" />);
    const poly = container.querySelector('polyline');
    expect(poly?.getAttribute('points')?.trim().split(/\s+/)).toHaveLength(3);
  });

  it('resserre l’axe sur l’amplitude réelle au lieu de partir de zéro', () => {
    const { container } = render(<TimeseriesChart points={plate} label="Remplissage moyen" />);
    const labels = Array.from(container.querySelectorAll('text')).map((t) => t.textContent ?? '');
    expect(labels.some((l) => l.includes('0'))).toBe(true);
    expect(labels.every((l) => !/^0$/.test(l))).toBe(true);
  });

  it('marque le dernier relevé', () => {
    const { container } = render(<TimeseriesChart points={plate} label="Remplissage moyen" />);
    expect(container.querySelector('circle')).toBeInTheDocument();
  });

  it('annonce la courbe aux lecteurs d’écran', () => {
    render(<TimeseriesChart points={plate} label="Remplissage moyen" />);
    expect(screen.getByRole('img', { name: /Remplissage moyen/ })).toBeInTheDocument();
  });

  it('rend un état vide explicite sans relevé', () => {
    render(<TimeseriesChart points={[]} label="Remplissage moyen" />);
    expect(screen.getByText(/Aucun relevé/)).toBeInTheDocument();
  });

  it('ne divise pas par zéro sur une série parfaitement plate', () => {
    const constante: MetricSnapshotPoint[] = [
      { bucket_date: '2026-08-29', value: 170, denominator: null },
      { bucket_date: '2026-08-30', value: 170, denominator: null },
    ];
    const { container } = render(<TimeseriesChart points={constante} label="Backlog" />);
    const pts = container.querySelector('polyline')?.getAttribute('points') ?? '';
    expect(pts).not.toContain('NaN');
  });
});
