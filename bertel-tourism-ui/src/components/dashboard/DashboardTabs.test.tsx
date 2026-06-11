import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardTabs } from './DashboardTabs';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

describe('DashboardTabs', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({ activeTab: 'quality' });
  });

  it('rend les 3 onglets avec le premier actif', () => {
    render(<DashboardTabs />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Qualité de la base',
      'Offre du territoire',
      'Activité équipe',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('change le store au clic', () => {
    render(<DashboardTabs />);
    fireEvent.click(screen.getByRole('tab', { name: 'Offre du territoire' }));
    expect(useDashboardFilterStore.getState().activeTab).toBe('offer');
  });
});
