import { render, screen, fireEvent, act } from '@testing-library/react';
import { ActualisationTable } from './ActualisationTable';
import { useDashboardExplorerStore } from '../../store/explorer-store';
import { activeDrilldownTypes } from '../../lib/dashboard-type-drilldown';

const data = {
  threshold_days: 90,
  rows: [
    { type: 'HOT' as const, total: 10, up_to_date: 7, to_review: 2, stale: 1, rate: 70, weekly_rates: null },
  ],
};

describe('ActualisationTable — drill-down', () => {
  beforeEach(() => {
    act(() => useDashboardExplorerStore.getState().resetAll());
  });

  it('clic sur la cellule type filtre sur ce type', () => {
    render(<ActualisationTable data={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hôtel' }));
    expect(activeDrilldownTypes(useDashboardExplorerStore.getState())).toContain('HOT');
  });

  it('re-clic retire le type (toggle off)', () => {
    render(<ActualisationTable data={data} />);
    const btn = screen.getByRole('button', { name: 'Hôtel' });
    fireEvent.click(btn); // on
    expect(activeDrilldownTypes(useDashboardExplorerStore.getState())).toContain('HOT');
    fireEvent.click(btn); // off
    expect(activeDrilldownTypes(useDashboardExplorerStore.getState())).not.toContain('HOT');
  });
});
