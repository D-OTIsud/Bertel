import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveFilterStrip } from './ActiveFilterStrip';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

// le bouton "Ouvrir dans l'Explorer" (tâche 11) importera next/navigation — mock neutre posé d'avance, à conserver.
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('ActiveFilterStrip — chips', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({
      filters: {
        status: ['published'],
        lieuDits: ['La Plaine des Cafres'],
        taxonomyAny: [{ domain: 'taxonomy_hot', code: 'hotel' }],
        classificationsAny: [{ schemeCode: 'hot_stars', valueCode: '4' }],
        languagesAny: ['en'],
        amenityFamiliesAny: ['wellness'],
        labelsAny: ['famille-plus'],
      },
      activeTab: 'quality',
      sidebarCollapsed: false,
    });
  });

  it('affiche une chip par filtre actif et la retire au clic', () => {
    render(<ActiveFilterStrip />);
    expect(screen.getByText(/Lieu-dit : La Plaine des Cafres/)).toBeInTheDocument();
    expect(screen.getByText(/hotel/)).toBeInTheDocument();
    expect(screen.getByText(/Distinction : hot_stars 4/)).toBeInTheDocument();
    expect(screen.getByText(/Langue : en/)).toBeInTheDocument();
    expect(screen.getByText(/Famille : wellness/)).toBeInTheDocument();
    expect(screen.getByText(/Tag : famille-plus/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Langue : en/));
    expect(useDashboardFilterStore.getState().filters.languagesAny).toBeUndefined();
  });

  it("retirer un élément d'une liste multiple conserve le reste", () => {
    useDashboardFilterStore.setState({
      filters: { status: ['published'], languagesAny: ['en', 'fr'] },
      activeTab: 'quality',
      sidebarCollapsed: false,
    });
    render(<ActiveFilterStrip />);
    fireEvent.click(screen.getByText(/Langue : en/));
    expect(useDashboardFilterStore.getState().filters.languagesAny).toEqual(['fr']);
  });
});
