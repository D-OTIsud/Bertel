import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from './DashboardPage';
import { useDashboardFilterStore } from '../store/dashboard-filter-store';
import { useDashboardExplorerStore } from '../store/explorer-store';
import {
  getDashboardCrmActivity,
  getDashboardCrmOpen,
  getDashboardScorecards,
  getDashboardTeamActivity,
} from '../services/dashboard-rpc';

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
    // Les deux clés de 17h sont OBLIGATOIRES ici : `jest.mock` remplace tout le module, donc
    // un mock incomplet ne fait pas échouer tsc — il rend « NaN » à l'écran, en silence.
    open_interactions: 170, open_tasks: 2, total: 172,
    recent_interactions: 3, backlog_interactions: 167,
  }),
  getDashboardTeamActivity: jest.fn().mockResolvedValue({
    weeks: [
      { week_start: '2026-08-24', editor_days: 3, editors: 2, objects_touched: 2, created: 0 },
      { week_start: '2026-08-31', editor_days: 2, editors: 2, objects_touched: 2, created: 0 },
    ],
    contributors: [
      { user_id: 'u1', display_name: 'David Philippe', active_days: 18, objects_touched: 486,
        bulk_days: 5, first_at: '2026-06-16T05:51:03Z', last_at: '2026-08-31T07:04:52Z' },
    ],
  }),
  getDashboardCrmActivity: jest.fn().mockResolvedValue({
    open_by_age: [
      { bucket: 'lt_30d', count: 3 }, { bucket: 'd30_90', count: 0 },
      { bucket: 'd90_1y', count: 24 }, { bucket: 'gt_1y', count: 143 },
    ],
    open_by_topic: [
      { code: 'demande_signaletique', name: 'Demande signalétique', count: 123, oldest: '2018-11-14T00:00:00Z' },
    ],
    monthly_flow: [
      { month: '2026-07-01', created: 0, resolved: 2 },
      { month: '2026-08-01', created: 3, resolved: 0 },
    ],
    net: { avg_days: null, count: 0 },
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

  it("l'onglet Activité rend ses widgets, et plus le panneau « à venir »", async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Activité équipe' }));

    expect(await screen.findByText('Rythme de saisie')).toBeInTheDocument();
    expect(screen.getByText('Contributeurs')).toBeInTheDocument();
    expect(await screen.findByText('Ce qui attend, et depuis quand')).toBeInTheDocument();
    expect(screen.getByText('Ce qui entre et ce qui sort')).toBeInTheDocument();
    expect(screen.getByText('Temps de traitement net')).toBeInTheDocument();
    // Le placeholder a bien disparu — sans cette assertion, l'ajout des widgets pourrait le
    // laisser cohabiter avec eux sans que rien ne le signale.
    expect(screen.queryByText(/suivi d.activité arrive prochainement/i)).not.toBeInTheDocument();
  });

  it("les deux séries d'activité ne sont PAS chargées tant qu'on est sur un autre onglet", async () => {
    const team = getDashboardTeamActivity as jest.Mock;
    const crm = getDashboardCrmActivity as jest.Mock;
    team.mockClear();
    crm.mockClear();

    renderPage();
    await screen.findByText('5');
    expect(team).not.toHaveBeenCalled();
    expect(crm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Activité équipe' }));
    await waitFor(() => expect(team).toHaveBeenCalledTimes(1));
    expect(crm).toHaveBeenCalledTimes(1);
  });

  it('monte le panneau de filtres Explorer + la section Période', async () => {
    renderPage();
    expect(await screen.findByText('Période')).toBeInTheDocument();
    // Un groupe transverse de l'Explorer est présent.
    expect(screen.getByText('Localisation')).toBeInTheDocument();
  });

  it('affiche le compteur CRM global dans le bandeau', async () => {
    renderPage();
    // La carte met en tête ce qui est RÉCENT (3 demandes + 2 tâches = 5), pas le total : une
    // alerte qui ne redescend jamais cesse d'être une alerte. L'arriéré est dit à part.
    expect(await screen.findByText('5')).toBeInTheDocument();
    expect(screen.getByText('éléments à traiter')).toBeInTheDocument();
    expect(screen.getByText(/\+ 167 demandes plus anciennes/)).toBeInTheDocument();
  });

  it('ne rappelle pas le compteur CRM (global) quand un filtre change, contrairement à un widget filtré', async () => {
    const scorecardsMock = getDashboardScorecards as jest.Mock;
    const crmOpenMock = getDashboardCrmOpen as jest.Mock;
    scorecardsMock.mockClear();
    crmOpenMock.mockClear();

    renderPage();
    await screen.findByText('5');
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
