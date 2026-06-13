import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmTimelineView } from './CrmTimelineView';
import * as crm from '../../services/crm';
import { mockCrmTimeline } from '../../data/mock';

jest.mock('../../services/crm');

const crmMock = crm as jest.Mocked<typeof crm>;

function renderTimeline(canWrite = true) {
  const onOpenObject = jest.fn();
  const onOpenActor = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CrmTimelineView canWrite={canWrite} onOpenObject={onOpenObject} onOpenActor={onOpenActor} />
    </QueryClientProvider>,
  );
  return { onOpenObject, onOpenActor };
}

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listCrmTimeline.mockResolvedValue(mockCrmTimeline);
  crmMock.listDemandTopics.mockResolvedValue([
    { code: 'demande_de_visite', name: 'Demande de visite' },
    { code: 'modification_infos_bdd', name: 'Modification infos BDD' },
  ]);
  crmMock.saveCrmInteraction.mockResolvedValue('new-reply');
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

  // Rectif PO v5 point 5 : cliquer une carte de la timeline ouvre la fiche de SON acteur.
  it('clic sur une carte → onOpenActor(actorId)', async () => {
    const { onOpenActor } = renderTimeline();
    // evt-1 (actor-1) : titre = sujet normalisé « Demande de visite » ; on cible la carte par
    // son corps pour ne pas confondre avec l'option homonyme du filtre Sujet. A11y (§66) : la
    // région cliquable est .tl-card__nav (la carte elle-même n'est plus role=button).
    const card = (await screen.findByText('Besoin d une nouvelle photo facade.')).closest('.tl-card') as HTMLElement;
    fireEvent.click(card.querySelector('.tl-card__nav') as HTMLElement);
    expect(onOpenActor).toHaveBeenCalledWith('actor-1');
  });

  // Le tag de contexte garde son propre clic → vue établissement (stopPropagation).
  it('clic sur le tag de contexte → onOpenObject (pas onOpenActor)', async () => {
    const { onOpenObject, onOpenActor } = renderTimeline();
    const card = (await screen.findByText('Besoin d une nouvelle photo facade.')).closest('.tl-card') as HTMLElement;
    // A11y (§66) : le tag de contexte (.ctx-tag) vit dans la région navigable (role=button), dont
    // le nom accessible englobe « Hotel Basalte » ⇒ on cible le tag par sa classe, pas par rôle.
    fireEvent.click(card.querySelector('.ctx-tag') as HTMLElement);
    expect(onOpenObject).toHaveBeenCalledWith('obj-1');
    expect(onOpenActor).not.toHaveBeenCalled();
  });

  // §65/§66 — répondre depuis la timeline : saveCrmInteraction({parentInteractionId}) + refetch.
  it('Répondre → saveCrmInteraction({ parentInteractionId }) puis recharge la timeline', async () => {
    renderTimeline();
    const card = (await screen.findByText('Besoin d une nouvelle photo facade.')).closest('.tl-card') as HTMLElement;
    const actionsBar = card.querySelector('.tl-actions') as HTMLElement;
    fireEvent.click(within(actionsBar).getByRole('button', { name: /répondre/i }));
    const composer = card.querySelector('.tl-reply-composer') as HTMLElement;
    fireEvent.change(within(composer).getByPlaceholderText(/votre réponse/i), { target: { value: 'Réponse au fil.' } });
    fireEvent.click(within(composer).getByRole('button', { name: /envoyer/i }));
    await waitFor(() =>
      expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith({ parentInteractionId: 'evt-1', body: 'Réponse au fil.' }),
    );
  });

  // §65/§66 — bascule traitée : evt-1 est planned ⇒ « Marquer traitée » → status done.
  it('Marquer traitée → saveCrmInteraction({ id, status: done })', async () => {
    renderTimeline();
    const card = (await screen.findByText('Besoin d une nouvelle photo facade.')).closest('.tl-card') as HTMLElement;
    const actionsBar = card.querySelector('.tl-actions') as HTMLElement;
    fireEvent.click(within(actionsBar).getByRole('button', { name: /marquer traitée/i }));
    await waitFor(() => expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith({ id: 'evt-1', status: 'done' }));
  });

  // Gating page-wide (no-write-trap) : sans permission, les actions du fil sont désactivées.
  it('sans permission : Répondre / Marquer traitée désactivés avec raison', async () => {
    renderTimeline(false);
    const card = (await screen.findByText('Besoin d une nouvelle photo facade.')).closest('.tl-card') as HTMLElement;
    const actionsBar = card.querySelector('.tl-actions') as HTMLElement;
    const replyBtn = within(actionsBar).getByRole('button', { name: /répondre/i });
    expect(replyBtn).toBeDisabled();
    expect(within(actionsBar).getByRole('button', { name: /marquer traitée/i })).toBeDisabled();
    expect(replyBtn).toHaveAttribute('title', expect.stringMatching(/lecture seule/i));
  });
});
