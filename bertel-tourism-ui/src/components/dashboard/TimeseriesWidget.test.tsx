import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TimeseriesWidget } from './TimeseriesWidget';
import { getMetricSnapshotSeries } from '../../services/metric-snapshot-rpc';
import type { MetricSnapshotSeries } from '../../types/metric-snapshot';

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
const bounds = { firstSnapshotDate: '2026-06-30', lastSnapshotDate: '2026-08-30' };

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const metrics = [
  { key: 'completeness_avg', label: 'Remplissage', unit: ' %', decimals: 1 },
  { key: 'corpus_count', label: 'Corpus' },
];

describe('TimeseriesWidget', () => {
  it('ne charge ni ne présente les relevés globaux comme un historique prestataires', () => {
    mockedSeries.mockClear();
    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled providerOnly />);
    expect(screen.getByText(/Historique indisponible pour ce périmètre/)).toBeInTheDocument();
    expect(mockedSeries).not.toHaveBeenCalled();
    expect(screen.queryByText(/n’obéit pas au panneau de filtres/)).not.toBeInTheDocument();
  });
  beforeEach(() => {
    mockedSeries.mockReset();
    mockedSeries.mockResolvedValue({ points, ...bounds });
  });

  it('dit que la série est globale et n’obéit pas aux filtres', async () => {
    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled />);
    expect(await screen.findByText(/n’obéit pas au panneau de filtres/)).toBeInTheDocument();
  });

  it('annonce la profondeur d’historique disponible', async () => {
    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled />);
    expect(await screen.findByText(/année sur année/)).toBeInTheDocument();
  });

  describe('profondeur d’historique en JOURS, pas en nombre de points (T5)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-30T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('mesure la durée entre les dates sources, jamais le nombre de points', async () => {
      // 3 points seulement (grain hebdo mocké), mais le premier relevé date du 2026-06-30 :
      // 61 jours réels d'historique — un compte de points afficherait « 3 relevés », mensonge
      // que ce correctif supprime.
      wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé quotidien figé depuis le 30 juin 2026." metrics={metrics} scope="global" enabled />);
      expect(await screen.findByText(/61 jours d’historique — la comparaison année sur année/)).toBeInTheDocument();
      expect(screen.queryByText(/3 relevés? d’historique/)).not.toBeInTheDocument();
    });

    it('ne transforme pas un relevé du vendredi en quatre jours à partir du lundi', async () => {
      jest.setSystemTime(new Date('2026-10-30T12:00:00Z'));
      mockedSeries.mockResolvedValue({
        points: [{ bucket_date: '2026-10-26', value: 93.7, denominator: 735 }],
        firstSnapshotDate: '2026-10-30', lastSnapshotDate: '2026-10-30',
      });
      wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage" subtitle="Relevés quotidiens." metrics={metrics} scope="global" enabled />);
      expect(await screen.findByText(/Premier relevé disponible/)).toBeInTheDocument();
      expect(screen.queryByText(/4 jours d’historique/)).not.toBeInTheDocument();
    });

    it('compte du 19 juin au 30 octobre sans arrondir à la semaine ni prolonger au jour du navigateur', async () => {
      jest.setSystemTime(new Date('2026-11-15T12:00:00Z'));
      mockedSeries.mockResolvedValue({
        points: [
          { bucket_date: '2026-06-15', value: 92.3, denominator: 361 },
          { bucket_date: '2026-10-26', value: 93.7, denominator: 735 },
        ],
        firstSnapshotDate: '2026-06-19', lastSnapshotDate: '2026-10-30',
      });
      wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage" subtitle="Relevés quotidiens." metrics={metrics} scope="global" enabled />);
      expect(await screen.findByText(/133 jours d’historique/)).toBeInTheDocument();
    });

    it('n’affiche pas la note de profondeur quand le registre ne renvoie aucun point', async () => {
      mockedSeries.mockResolvedValue({ points: [], firstSnapshotDate: null, lastSnapshotDate: null });
      wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled />);
      expect(await screen.findByText(/Aucun relevé/)).toBeInTheDocument();
      expect(screen.queryByText(/d’historique/)).not.toBeInTheDocument();
    });
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
    mockedSeries.mockResolvedValue({ points: [], firstSnapshotDate: null, lastSnapshotDate: null });
    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled />);
    expect(await screen.findByText(/Aucun relevé/)).toBeInTheDocument();
  });

  it('ne montre jamais la valeur de l’ancienne métrique sous l’unité de la nouvelle', async () => {
    // Le service répond différemment selon la métrique demandée : un pourcentage
    // pour « Remplissage », un compte pour « Corpus ». La réponse de « Corpus »
    // est retardée à la main pour pouvoir inspecter l'écran pendant la transition,
    // avant qu'elle ne réponde.
    let resolveCorpus: (value: MetricSnapshotSeries) => void = () => {};
    const corpusPromise = new Promise<MetricSnapshotSeries>((resolve) => {
      resolveCorpus = resolve;
    });
    mockedSeries.mockImplementation(async (args) => {
      if (args.metricKey === 'corpus_count') {
        return corpusPromise;
      }
      return { points: [{ bucket_date: '2026-08-30', value: 92.3, denominator: 361 }],
        firstSnapshotDate: '2026-08-30', lastSnapshotDate: '2026-08-30' };
    });

    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled />);

    // Ciblé sur ".timeseries-value strong" : la courbe SVG arrondit ses graduations
    // d'axe aux mêmes chiffres et créerait sinon des correspondances multiples.
    const valueSelector = { selector: '.timeseries-value strong' };
    expect(await screen.findByText('92,3 %', valueSelector)).toBeInTheDocument();

    const corpus = screen.getByRole('button', { name: 'Corpus' });
    fireEvent.click(corpus);

    // Le sélecteur reste monté et cliquable pendant la transition — ce n'est pas
    // le bug d'origine (démontage du bouton) qu'on rouvre ici.
    expect(screen.getByRole('button', { name: 'Corpus' })).toHaveAttribute('aria-pressed', 'true');

    // Tant que « Corpus » n'a pas répondu, la valeur de « Remplissage » (92,3) ne
    // doit plus être affichée. Avec l'ancienne implémentation (refs), elle restait
    // visible mais sans le « % » — comme si 92,3 était un compte de fiches, la
    // confusion que ce correctif supprime.
    expect(screen.queryByText('92,3', valueSelector)).not.toBeInTheDocument();

    resolveCorpus({ points: [{ bucket_date: '2026-08-30', value: 843, denominator: null }],
      firstSnapshotDate: '2026-08-30', lastSnapshotDate: '2026-08-30' });

    expect(await screen.findByText('843', valueSelector)).toBeInTheDocument();
  });
});
