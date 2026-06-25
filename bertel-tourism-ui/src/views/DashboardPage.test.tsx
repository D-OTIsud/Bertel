import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from './DashboardPage';
import { useDashboardFilterStore } from '../store/dashboard-filter-store';

// ActiveFilterStrip appelle useRouter() — mock neutre requis dans tout test qui le rend.
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('../services/dashboard-reference', () => ({
  getDashboardAdvancedFilterOptions: jest.fn().mockResolvedValue({
    taxonomyDomains: [], taxonomyCodes: [], distinctionValues: [],
    languages: [], amenityFamilies: [], tags: [],
  }),
}));

jest.mock('../services/dashboard-rpc', () => ({
  getDashboardScorecards: jest.fn().mockResolvedValue({
    total: 10, published: 8, published_pct: 80, avg_completeness: 92,
    distinctions: 4, distinctions_pct: 40,
    pending_changes: 1, delta_30d: 2, delta_pct: null, avg_processing_days: null,
  }),
  getDashboardTypeBreakdown: jest.fn().mockResolvedValue({
    total: 10,
    rows: [{ type: 'HOT', count: 10, published: 8, draft: 2, archived: 0, pct_of_total: 100 }],
  }),
  getDashboardCityDistribution: jest.fn().mockResolvedValue({
    rows: [{ city: 'Le Tampon', count: 5, delta_30d: 1 }],
  }),
  getDashboardActualisation: jest.fn().mockResolvedValue({
    threshold_days: 90,
    rows: [{ type: 'HOT', total: 10, up_to_date: 7, to_review: 2, stale: 1, rate: 70, weekly_rates: null }],
  }),
  getDashboardCompleteness: jest.fn().mockResolvedValue({
    rows: [{ type: 'HOT', total: 10, avg_score: 95, complete_pct: 80, missing_top_field: 'photos', below_80: [] }],
  }),
  getDashboardDistinctionOverview: jest.fn().mockResolvedValue({
    total_scoped: 10, with_distinction: 4, without_distinction: 6, distinction_pct: 40,
    by_scheme: [{ scheme_code: 'hot_stars', scheme_name: 'Étoiles hôtel', display_group: 'official_classification', count: 4 }],
  }),
  getDashboardFilterOptions: jest.fn().mockResolvedValue({ cities: ['Le Tampon'], lieuDits: [] }),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

describe('DashboardPage — onglets', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({ filters: { status: ['published'] }, activeTab: 'quality', sidebarCollapsed: false });
  });

  it("l'onglet Qualité (défaut) montre corpus + complétude + actualisation, pas les communes", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Corpus par type')).toBeInTheDocument());
    expect(screen.getByText('Complétude par type')).toBeInTheDocument();
    expect(screen.getByText("Taux d'actualisation")).toBeInTheDocument();
    expect(screen.queryByText('Par commune')).not.toBeInTheDocument();
  });

  it("l'onglet Offre montre communes + distinctions", async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Offre du territoire' }));
    await waitFor(() => expect(screen.getByText('Par commune')).toBeInTheDocument());
    expect(screen.getByText('Distinctions')).toBeInTheDocument();
    expect(screen.queryByText("Taux d'actualisation")).not.toBeInTheDocument();
    expect(screen.queryByText('Corpus par type')).not.toBeInTheDocument();
  });

  it("l'onglet Activité affiche le panneau « à venir » explicite", async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Activité équipe' }));
    expect(await screen.findByText(/lot 4/i)).toBeInTheDocument();
  });
});
