import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from './DashboardPage';
import { useDashboardFilterStore } from '../store/dashboard-filter-store';
import { useDashboardExplorerStore } from '../store/explorer-store';
import { getDashboardScorecards, getDashboardCrmOpen } from '../services/dashboard-rpc';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('../services/explorer-reference', () => ({
  listExplorerReferences: jest.fn().mockResolvedValue({
    cities: [], lieuDits: [], taxonomies: [], accessibilityDisabilityTypes: [], accessibilityAmenities: [],
    sustainabilityCategories: [], rankedLabelSchemes: [], rankedLabelSchemeValues: {}, tags: [],
    environmentTags: [], amenityFamilies: [], hotCapacityMetrics: [], resCapacityMetrics: [], itiPractices: [],
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
  getDashboardCrmOpen: jest.fn().mockResolvedValue({
    open_interactions: 170, open_tasks: 2, total: 172,
  }),
}));

jest.mock('../services/metric-snapshot-rpc', () => ({
  getMetricSnapshotSeries: jest.fn().mockResolvedValue({
    points: [
      { bucket_date: '2026-06-30', value: 92.3, denominator: 361 },
      { bucket_date: '2026-08-30', value: 91.4, denominator: 843 },
    ],
  }),
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
    useDashboardFilterStore.setState({ updatedAtFrom: null, updatedAtTo: null, activeTab: 'quality' });
    act(() => useDashboardExplorerStore.getState().resetAll());
  });

  it("l'onglet Qualité (défaut) montre corpus + complétude + actualisation, pas les communes", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Corpus par type')).toBeInTheDocument());
    expect(screen.getByText('Remplissage par type')).toBeInTheDocument();
    expect(screen.getByText("Taux d'actualisation")).toBeInTheDocument();
    expect(screen.queryByText('Par commune')).not.toBeInTheDocument();
  });

  it("l'onglet Offre montre communes + distinctions", async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Offre du territoire' }));
    await waitFor(() => expect(screen.getByText('Par commune')).toBeInTheDocument());
    // « Distinctions » widget heading — le panneau de filtres a aussi un groupe
    // « Distinctions » (§175) désormais monté en permanence dans la sidebar.
    expect(screen.getByRole('heading', { name: 'Distinctions' })).toBeInTheDocument();
    expect(screen.queryByText("Taux d'actualisation")).not.toBeInTheDocument();
    expect(screen.queryByText('Corpus par type')).not.toBeInTheDocument();
  });

  it("l'onglet Activité affiche le panneau « à venir » explicite", async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Activité équipe' }));
    expect(await screen.findByText(/suivi d.activité arrive prochainement/i)).toBeInTheDocument();
  });

  it('monte le panneau de filtres Explorer + la section Période', async () => {
    renderPage();
    expect(await screen.findByText('Période')).toBeInTheDocument();
    // Un groupe transverse de l'Explorer est présent.
    expect(screen.getByText('Localisation')).toBeInTheDocument();
  });

  it('affiche le compteur CRM global dans le bandeau', async () => {
    renderPage();
    // Le total CRM (172) doit s'afficher dans la carte d'attention du bandeau.
    expect(await screen.findByText('172')).toBeInTheDocument();
    // Vérifier aussi le libellé spécifique au total > 1.
    expect(screen.getByText('demandes en cours')).toBeInTheDocument();
  });

  it('ne rappelle pas le compteur CRM (global) quand un filtre change, contrairement à un widget filtré', async () => {
    const scorecardsMock = getDashboardScorecards as jest.Mock;
    const crmOpenMock = getDashboardCrmOpen as jest.Mock;
    scorecardsMock.mockClear();
    crmOpenMock.mockClear();

    renderPage();
    await screen.findByText('172');
    expect(scorecardsMock).toHaveBeenCalledTimes(1);
    expect(crmOpenMock).toHaveBeenCalledTimes(1);

    // Changer un filtre régénère `params` → nouvelle queryKey pour les widgets
    // filtrés (ex. scorecards), qui doivent donc refetcher.
    act(() => useDashboardExplorerStore.getState().setCities(['Le Tampon']));

    await waitFor(() => expect(scorecardsMock).toHaveBeenCalledTimes(2));
    // Le compteur CRM est global (queryKey sans filtres) : il ne doit PAS être
    // rappelé, alors qu'un getter dépendant des filtres l'a bien été.
    expect(crmOpenMock).toHaveBeenCalledTimes(1);
  });
});
