import { render, screen, fireEvent } from '@testing-library/react';
import { CompletenessTable } from './CompletenessTable';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';
import type { DashboardCompleteness } from '../../types/dashboard';

const data: DashboardCompleteness = {
  rows: [
    {
      type: 'HLO',
      total: 171,
      avg_score: 96,
      complete_pct: 63.7,
      missing_top_field: 'photos',
      below_80: [{ id: 'HLO1', name: 'Gîte', score: 63, missing_fields: ['photos'] }],
    },
    {
      type: 'HOT',
      total: 7,
      avg_score: 98,
      complete_pct: 100,
      missing_top_field: '',
      below_80: [],
    },
  ],
};

describe('CompletenessTable', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({ filters: { status: ['published'] }, activeTab: 'quality', sidebarCollapsed: false });
  });

  it('rend le % de fiches complètes et le libellé FR de l’essentiel manquant', () => {
    render(<CompletenessTable data={data} />);
    expect(screen.getByText('63.7 %')).toBeInTheDocument();
    expect(screen.getByText('Photos')).toBeInTheDocument(); // 'photos' → libellé FR
    expect(screen.getByText('—')).toBeInTheDocument(); // HOT n'a aucun manque
  });

  it('clic sur la cellule type filtre sur ce type (drill-down toggle)', () => {
    render(<CompletenessTable data={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'HLO' }));
    expect(useDashboardFilterStore.getState().filters.types).toEqual(['HLO']);
  });
});
