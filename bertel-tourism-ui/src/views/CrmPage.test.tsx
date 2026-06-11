import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CrmPage from './CrmPage';
import * as crm from '../services/crm';
import type { ActorCrmSnapshot } from '../services/crm';
import { mockCrmDirectory, mockCrmTasks, mockCrmTimeline } from '../data/mock';

jest.mock('../services/crm');
jest.mock('../hooks/usePresenceRoom', () => ({
  usePresenceRoom: () => ({ peers: [], typingUsers: [], announceTyping: jest.fn() }),
}));

const crmMock = crm as jest.Mocked<typeof crm>;

const actorSnapshot: ActorCrmSnapshot = {
  actor: { id: 'actor-1', displayName: 'Mme Marie Hoarau', firstName: 'Marie', lastName: 'Hoarau' },
  objects: [
    { objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', objectType: 'HOT', roleCode: 'manager', roleName: 'Gérante', isPrimary: true },
  ],
  interactions: [
    {
      id: 'i1', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', interactionType: 'call',
      direction: 'outbound', status: 'done', subject: 'Appel tarifs', body: 'Tarifs validés.',
      occurredAt: '2026-06-04T10:00:00Z', actorName: null, topicCode: null, topicName: null,
      sentimentCode: 'positif', sentimentName: 'Positif', ownerName: 'Florence', source: 'bertel_ui',
    },
  ],
  topics: [],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CrmPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.removeItem('bertel-crm-nav-v2');
  crmMock.listCrmDirectory.mockResolvedValue(mockCrmDirectory);
  crmMock.listCrmTasks.mockResolvedValue(mockCrmTasks);
  crmMock.listCrmTimeline.mockResolvedValue(mockCrmTimeline);
  crmMock.listActorCrm.mockResolvedValue(actorSnapshot);
  crmMock.listObjectCrm.mockResolvedValue({ interactions: [], topics: [], actors: [], tasks: [] });
  crmMock.listDemandTopics.mockResolvedValue([{ code: 'demande_de_visite', name: 'Demande de visite' }]);
  crmMock.userCanWriteCrmNotes.mockResolvedValue(true);
  crmMock.saveCrmTask.mockResolvedValue('task-1');
  crmMock.saveCrmInteraction.mockResolvedValue('interaction-1');
});

describe('CrmPage (§61 — shell acteur-centré)', () => {
  it('onglet par défaut = annuaire des acteurs (données réelles list_crm_directory)', async () => {
    renderPage();
    expect(await screen.findByText('Mme Marie Hoarau')).toBeInTheDocument();
    expect(screen.getByText('Acteurs suivis')).toBeInTheDocument();
    // Les 3 onglets sont rendus.
    expect(screen.getByRole('button', { name: /tâches & relances/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeInTheDocument();
  });

  it('drill-in : ligne annuaire → fiche acteur → vue établissement → retours', async () => {
    renderPage();
    // Ligne annuaire de l'acteur-1 (cohérent avec le mock list_actor_crm).
    fireEvent.click(await screen.findByText('Mme Marie Hoarau'));
    expect(await screen.findByText('Appel tarifs')).toBeInTheDocument();
    // Drill-in établissement depuis la carte du rail.
    const rail = screen.getByRole('group', { name: /établissements & rôles/i });
    fireEvent.click(within(rail).getByRole('button', { name: /hotel basalte & lagon/i }));
    expect(await screen.findByRole('link', { name: /ouvrir dans l.éditeur/i })).toHaveAttribute('href', '/objects/obj-1/edit');
    // Retour vue établissement → fiche acteur d'origine (nom résolu par l'annuaire).
    fireEvent.click(screen.getByRole('button', { name: 'Mme Marie Hoarau' }));
    expect(await screen.findByText('Appel tarifs')).toBeInTheDocument();
    // Retour fiche → annuaire.
    fireEvent.click(screen.getByRole('button', { name: /annuaire des acteurs/i }));
    expect(await screen.findByText('Acteurs suivis')).toBeInTheDocument();
  });

  it('vue établissement ouverte depuis un onglet : le libellé du retour nomme cet onglet', async () => {
    renderPage();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getByRole('button', { name: /tâches & relances/i }));
    await screen.findByText('Rappeler le directeur');
    // Drill-in établissement depuis la ligne de tâche (pas de fiche acteur d'origine).
    fireEvent.click(screen.getByRole('button', { name: /hotel basalte & lagon/i }));
    await screen.findByRole('link', { name: /ouvrir dans l.éditeur/i });
    // Le retour est libellé d'après l'onglet d'origine, pas « Annuaire des acteurs ».
    expect(screen.getByRole('button', { name: 'Tâches & relances' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annuaire des acteurs' })).not.toBeInTheDocument();
  });

  it('persiste la navigation dans localStorage bertel-crm-nav-v2 et la restaure', async () => {
    renderPage();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getByRole('button', { name: /tâches & relances/i }));
    await screen.findByText('Rappeler le directeur');
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('bertel-crm-nav-v2') ?? '{}')).toMatchObject({ view: 'taches' }),
    );
  });

  it('restaure une vue persistée (timeline) au chargement', async () => {
    localStorage.setItem('bertel-crm-nav-v2', JSON.stringify({ view: 'timeline' }));
    renderPage();
    expect(await screen.findByText('Appel de suivi')).toBeInTheDocument();
  });

  // ── Assertions verrouillées par revue (§58) — conservées sur le nouveau shell ──

  it('persiste un changement d état de tâche via saveCrmTask (vue tâches)', async () => {
    renderPage();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getByRole('button', { name: /tâches & relances/i }));
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: 'Basculer la tâche « Rappeler le directeur »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-1', status: 'done' }));
  });

  it('affiche une erreur quand l écriture échoue (pas d échec silencieux)', async () => {
    crmMock.saveCrmTask.mockRejectedValue(new Error('refus RLS'));
    renderPage();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getByRole('button', { name: /tâches & relances/i }));
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: 'Basculer la tâche « Rappeler le directeur »' }));
    expect(await screen.findByText(/refus RLS/)).toBeInTheDocument();
  });

  it('désactive l écriture avec raison sans write_crm_notes (no-write-trap)', async () => {
    crmMock.userCanWriteCrmNotes.mockResolvedValue(false);
    renderPage();
    await screen.findByText('Mme Marie Hoarau');
    expect(screen.getAllByText(/lecture seule/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /tâches & relances/i }));
    await screen.findByText('Rappeler le directeur');
    expect(screen.getByRole('button', { name: 'Basculer la tâche « Rappeler le directeur »' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /nouvelle tâche/i })).toBeDisabled();
  });

  it('ne rend plus le bouton démo « Simuler une note »', async () => {
    renderPage();
    await screen.findByText('Mme Marie Hoarau');
    expect(screen.queryByText('Simuler une note')).not.toBeInTheDocument();
  });

  it('timeline : « Charger plus » si has_more, et objectName null → « Général »', async () => {
    crmMock.listCrmTimeline.mockResolvedValue({
      items: [
        ...mockCrmTimeline.items,
        {
          id: 'evt-general', objectId: null, objectName: null, interactionType: 'note',
          direction: 'internal', status: 'done', subject: 'Note acteur seul', body: null,
          occurredAt: '2026-06-10T08:00:00Z', actorName: 'Mme Marie Hoarau', topicCode: null,
          topicName: null, sentimentCode: null, sentimentName: null, ownerName: 'Florence', source: 'bertel_ui',
        },
      ],
      hasMore: true,
    });
    localStorage.setItem('bertel-crm-nav-v2', JSON.stringify({ view: 'timeline' }));
    renderPage();
    expect(await screen.findByText('Appel de suivi')).toBeInTheDocument();
    expect(screen.getByText('Note acteur seul')).toBeInTheDocument();
    expect(screen.getByText('Général')).toBeInTheDocument(); // contexte null
    expect(screen.getByText('Mme Marie Hoarau')).toBeInTheDocument(); // QUI par carte
    expect(screen.getByRole('button', { name: /charger plus/i })).toBeInTheDocument();
  });

  it('garde la timeline rendue pendant « Charger plus » (pas de collapse)', async () => {
    crmMock.listCrmTimeline.mockResolvedValue({ ...mockCrmTimeline, hasMore: true });
    localStorage.setItem('bertel-crm-nav-v2', JSON.stringify({ view: 'timeline' }));
    renderPage();
    await screen.findByText('Appel de suivi');
    crmMock.listCrmTimeline.mockReturnValue(new Promise<never>(() => {})); // page 2 jamais résolue
    fireEvent.click(screen.getByRole('button', { name: /charger plus/i }));
    expect(screen.getByText('Appel de suivi')).toBeInTheDocument(); // liste toujours là
    expect(screen.queryByText(/chargement de la timeline/i)).not.toBeInTheDocument();
  });
});
