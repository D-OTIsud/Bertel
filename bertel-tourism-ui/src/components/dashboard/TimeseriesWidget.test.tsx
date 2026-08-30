import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TimeseriesWidget } from './TimeseriesWidget';
import { getMetricSnapshotSeries } from '../../services/metric-snapshot-rpc';

// jest.mock avec fabrique, PAS jest.spyOn sur un espace de noms importé :
// le transform SWC de next/jest rend les exports non configurables, et un spyOn
// y échoue silencieusement selon les versions. La fabrique, elle, est sûre.
jest.mock('../../services/metric-snapshot-rpc', () => ({
  getMetricSnapshotSeries: jest.fn(),
}));

const mockedSeries = getMetricSnapshotSeries as jest.MockedFunction<typeof getMetricSnapshotSeries>;

const points = [
  { bucket_date: '2026-06-30', value: 92.3, denominator: 361 },
  { bucket_date: '2026-07-31', value: 91.4, denominator: 839 },
  { bucket_date: '2026-08-30', value: 91.4, denominator: 843 },
];

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const metrics = [
  { key: 'completeness_avg', label: 'Remplissage', unit: ' %', decimals: 1 },
  { key: 'corpus_count', label: 'Corpus' },
];

describe('TimeseriesWidget', () => {
  beforeEach(() => {
    mockedSeries.mockReset();
    mockedSeries.mockResolvedValue({ points });
  });

  it('dit que la série est globale et n’obéit pas aux filtres', async () => {
    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled />);
    expect(await screen.findByText(/n’obéit pas au panneau de filtres/)).toBeInTheDocument();
  });

  it('annonce la profondeur d’historique disponible', async () => {
    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled />);
    expect(await screen.findByText(/année sur année/)).toBeInTheDocument();
  });

  it('change de métrique au clic sur le sélecteur', async () => {
    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled />);
    const corpus = await screen.findByRole('button', { name: 'Corpus' });
    fireEvent.click(corpus);
    expect(corpus).toHaveAttribute('aria-pressed', 'true');
  });

  it('ne déclenche aucune requête tant que l’onglet n’est pas visible', () => {
    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled={false} />);
    expect(mockedSeries).not.toHaveBeenCalled();
  });

  it('affiche l’état vide quand le registre ne renvoie rien', async () => {
    mockedSeries.mockResolvedValue({ points: [] });
    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled />);
    expect(await screen.findByText(/Aucun relevé/)).toBeInTheDocument();
  });
});
