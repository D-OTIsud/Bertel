import { render, screen, fireEvent, act } from '@testing-library/react';
import { CompletenessTable } from './CompletenessTable';
import { useDashboardExplorerStore } from '../../store/explorer-store';
import { activeDrilldownTypes } from '../../lib/dashboard-type-drilldown';
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
    act(() => useDashboardExplorerStore.getState().resetAll());
  });

  it('rend la jauge de complétude (richesse moyenne) et le libellé FR de l’essentiel manquant', () => {
    render(<CompletenessTable data={data} />);
    expect(screen.getByText('96 %')).toBeInTheDocument(); // avg_score HLO
    expect(screen.getByText('98 %')).toBeInTheDocument(); // avg_score HOT
    expect(screen.getByText('Photos')).toBeInTheDocument(); // 'photos' → libellé FR
    expect(screen.getByText('—')).toBeInTheDocument(); // HOT n'a aucun manque
  });

  it('clic sur la pastille de type filtre sur ce type (drill-down toggle)', () => {
    render(<CompletenessTable data={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gîte & meublé' }));
    expect(activeDrilldownTypes(useDashboardExplorerStore.getState())).toContain('HLO');
  });
});
