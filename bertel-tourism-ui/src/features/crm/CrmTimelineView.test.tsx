import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmTimelineView } from './CrmTimelineView';
import * as crm from '../../services/crm';
import { mockCrmTimeline } from '../../data/mock';

jest.mock('../../services/crm');

const crmMock = crm as jest.Mocked<typeof crm>;

function renderTimeline() {
  const onOpenObject = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CrmTimelineView onOpenObject={onOpenObject} />
    </QueryClientProvider>,
  );
  return onOpenObject;
}

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listCrmTimeline.mockResolvedValue(mockCrmTimeline);
  crmMock.listDemandTopics.mockResolvedValue([
    { code: 'demande_de_visite', name: 'Demande de visite' },
    { code: 'modification_infos_bdd', name: 'Modification infos BDD' },
  ]);
});

describe('CrmTimelineView (§63 v4 — timeline filtrable, PO points 6+7)', () => {
  // PO point 7 : défaut Toutes + Tout = la timeline complète — listCrmTimeline appelé SANS
  // status ni from (pas de borne de période ⇒ fin du bug « seulement 2 mois »).
  it('au montage, charge la timeline complète : ni status ni from (Toutes + Tout)', async () => {
    renderTimeline();
    await screen.findByText('Appel de suivi');
    expect(crmMock.listCrmTimeline).toHaveBeenCalledWith({});
  });

  // PO point 6 : la barre de filtres (identique à l'onglet Acteurs) pilote listCrmTimeline.
  it('la barre rend sujet (vocabulaire complet) + statut + période', async () => {
    renderTimeline();
    await screen.findByText('Appel de suivi');
    expect(screen.getByLabelText('Sujet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actives' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Traitées' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toutes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 j' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tout' })).toBeInTheDocument();
    // Le sujet propose tout le vocabulaire demand_topic.
    expect(screen.getByRole('option', { name: 'Modification infos BDD' })).toBeInTheDocument();
  });

  it('statut Actives → listCrmTimeline({status: active})', async () => {
    renderTimeline();
    await screen.findByText('Appel de suivi');
    fireEvent.click(screen.getByRole('button', { name: 'Actives' }));
    await waitFor(() => expect(crmMock.listCrmTimeline).toHaveBeenLastCalledWith({ status: 'active' }));
  });

  it('sujet + période bornent topicCode/from ; revenir à Toutes + Tout réenvoie l ensemble complet', async () => {
    renderTimeline();
    await screen.findByText('Appel de suivi');
    fireEvent.change(screen.getByLabelText('Sujet'), { target: { value: 'demande_de_visite' } });
    await waitFor(() => expect(crmMock.listCrmTimeline).toHaveBeenLastCalledWith({ topicCode: 'demande_de_visite' }));
    fireEvent.click(screen.getByRole('button', { name: '30 j' }));
    await waitFor(() =>
      expect(crmMock.listCrmTimeline).toHaveBeenLastCalledWith({
        topicCode: 'demande_de_visite',
        from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    );
    // Retour Tout (la période se vide) puis « Tous les sujets » → ensemble complet.
    fireEvent.click(screen.getByRole('button', { name: 'Tout' }));
    fireEvent.change(screen.getByLabelText('Sujet'), { target: { value: '' } });
    await waitFor(() => expect(crmMock.listCrmTimeline).toHaveBeenLastCalledWith({}));
  });

  // Assertion verrouillée par revue : « Charger plus » sans collapse (keepPreviousData).
  it('« Charger plus » : garde la liste rendue pendant le fetch de la page 2 (pas de collapse)', async () => {
    crmMock.listCrmTimeline.mockResolvedValue({ ...mockCrmTimeline, hasMore: true });
    renderTimeline();
    await screen.findByText('Appel de suivi');
    crmMock.listCrmTimeline.mockReturnValue(new Promise<never>(() => {})); // page 2 jamais résolue
    fireEvent.click(screen.getByRole('button', { name: /charger plus/i }));
    expect(screen.getByText('Appel de suivi')).toBeInTheDocument();
    expect(screen.queryByText(/chargement de la timeline/i)).not.toBeInTheDocument();
  });

  it('échec du chargement initial → erreur visible (pas d écran vide silencieux)', async () => {
    crmMock.listCrmTimeline.mockRejectedValue(new Error('refus RLS'));
    renderTimeline();
    expect(await screen.findByText(/refus RLS/)).toBeInTheDocument();
  });
});
