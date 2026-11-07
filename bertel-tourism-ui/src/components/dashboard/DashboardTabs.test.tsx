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

  it('D8 : roving tabindex — un seul arrêt Tab (l’onglet actif)', () => {
    render(<DashboardTabs />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it('D8 : les flèches déplacent le focus SANS activer (activation manuelle : les panneaux fetchent)', () => {
    render(<DashboardTabs />);
    const tablist = screen.getByRole('tablist');
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1].tabIndex).toBe(0); // le roving suit le focus
    expect(useDashboardFilterStore.getState().activeTab).toBe('quality'); // pas activé

    // Entrée/Espace = clic natif du bouton → activation.
    fireEvent.click(tabs[1]);
    expect(useDashboardFilterStore.getState().activeTab).toBe('offer');
  });

  it('D8 : ArrowLeft boucle et Home/End vont aux extrémités', () => {
    render(<DashboardTabs />);
    const tablist = screen.getByRole('tablist');
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();

    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(tabs[2]).toHaveFocus(); // boucle depuis le premier

    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(tabs[0]).toHaveFocus();

    fireEvent.keyDown(tablist, { key: 'End' });
    expect(tabs[2]).toHaveFocus();
  });
});
