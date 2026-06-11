import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmActorFiche } from './CrmActorFiche';
import * as crm from '../../services/crm';
import type { ActorCrmSnapshot } from '../../services/crm';

jest.mock('../../services/crm');

const crmMock = crm as jest.Mocked<typeof crm>;

const snapshot: ActorCrmSnapshot = {
  actor: { id: 'actor-1', displayName: 'Mme Marie Hoarau', firstName: 'Marie', lastName: 'Hoarau' },
  objects: [
    { objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', objectType: 'HOT', roleCode: 'manager', roleName: 'Gérante', isPrimary: true },
    { objectId: 'obj-2', objectName: 'Le Comptoir des Epices', objectType: 'RES', roleCode: 'owner', roleName: 'Propriétaire', isPrimary: false },
  ],
  interactions: [
    {
      id: 'i1', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', interactionType: 'call',
      direction: 'outbound', status: 'done', subject: 'Appel tarifs', body: 'Tarifs 2026 validés.',
      occurredAt: '2026-06-04T10:00:00Z', actorName: null, topicCode: 'modification_infos_bdd',
      topicName: 'Modification infos BDD', sentimentCode: 'positif', sentimentName: 'Positif',
      ownerName: 'Florence', source: 'bertel_ui',
    },
    {
      id: 'i2', objectId: 'obj-2', objectName: 'Le Comptoir des Epices', interactionType: 'email',
      direction: 'outbound', status: 'done', subject: 'Photos plats', body: null,
      occurredAt: '2026-05-18T08:00:00Z', actorName: null, topicCode: null, topicName: null,
      sentimentCode: 'inquiet', sentimentName: 'Inquiet', ownerName: 'Jean', source: 'bertel_ui',
    },
    {
      id: 'i3', objectId: null, objectName: null, interactionType: 'note',
      direction: 'internal', status: 'done', subject: 'Vœux annuels', body: 'Tour d’horizon.',
      occurredAt: '2026-01-08T09:00:00Z', actorName: null, topicCode: null, topicName: null,
      sentimentCode: null, sentimentName: null, ownerName: 'Florence', source: 'bertel_ui',
    },
  ],
  topics: [{ code: 'modification_infos_bdd', name: 'Modification infos BDD', count: 2 }],
};

function renderFiche(overrides: Partial<Parameters<typeof CrmActorFiche>[0]> = {}) {
  const props = {
    actorId: 'actor-1',
    canWrite: true,
    onBack: jest.fn(),
    onOpenObject: jest.fn(),
    ...overrides,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CrmActorFiche {...props} />
    </QueryClientProvider>,
  );
  return props;
}

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listActorCrm.mockResolvedValue(snapshot);
  crmMock.listDemandTopics.mockResolvedValue([
    { code: 'demande_de_visite', name: 'Demande de visite' },
    { code: 'modification_infos_bdd', name: 'Modification infos BDD' },
  ]);
  crmMock.saveCrmInteraction.mockResolvedValue('new-interaction');
});

describe('CrmActorFiche (§61 — fiche acteur 360°)', () => {
  it('rend le hero, les établissements liés avec rôles et le badge principal', async () => {
    renderFiche();
    expect(await screen.findByText('Mme Marie Hoarau')).toBeInTheDocument();
    expect(screen.getByText('2 établissements')).toBeInTheDocument();
    expect(screen.getByText('3 interactions')).toBeInTheDocument();
    // Cartes établissements : nom + rôle + badge principal sur le lien primaire.
    expect(screen.getByText('Gérante')).toBeInTheDocument();
    expect(screen.getByText('Propriétaire')).toBeInTheDocument();
    expect(screen.getByText('principal')).toBeInTheDocument();
    // Stats réelles.
    expect(screen.getByText('Interactions · 12 mois')).toBeInTheDocument();
    expect(screen.getByText('Sujets distincts')).toBeInTheDocument();
  });

  it('clic sur une carte établissement → onOpenObject(objectId)', async () => {
    const props = renderFiche();
    await screen.findByText('Appel tarifs');
    const rail = screen.getByRole('group', { name: /établissements & rôles/i });
    fireEvent.click(within(rail).getByRole('button', { name: /le comptoir des epices/i }));
    expect(props.onOpenObject).toHaveBeenCalledWith('obj-2');
  });

  it('les chips de contexte filtrent la timeline (objet précis, puis Général)', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    expect(screen.getByText('Photos plats')).toBeInTheDocument();
    expect(screen.getByText('Vœux annuels')).toBeInTheDocument();
    const filters = screen.getByRole('group', { name: /filtrer par contexte/i });
    // Filtre sur l'hôtel : seules ses interactions restent.
    fireEvent.click(within(filters).getByRole('button', { name: 'Hotel Basalte & Lagon' }));
    expect(screen.getByText('Appel tarifs')).toBeInTheDocument();
    expect(screen.queryByText('Photos plats')).not.toBeInTheDocument();
    expect(screen.queryByText('Vœux annuels')).not.toBeInTheDocument();
    // Filtre Général : seule l'interaction sans contexte objet reste.
    fireEvent.click(within(filters).getByRole('button', { name: 'Général' }));
    expect(screen.getByText('Vœux annuels')).toBeInTheDocument();
    expect(screen.queryByText('Appel tarifs')).not.toBeInTheDocument();
  });

  it('le composer consigne avec actorId + objectId + codes puis recharge la fiche', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /e-mail/i }));
    fireEvent.change(screen.getByLabelText('Contexte'), { target: { value: 'obj-2' } });
    fireEvent.change(screen.getByLabelText('Sujet normalisé'), { target: { value: 'demande_de_visite' } });
    fireEvent.change(screen.getByLabelText('Sentiment'), { target: { value: 'positif' } });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Demande de RDV photo.' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    await waitFor(() =>
      expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith({
        actorId: 'actor-1',
        objectId: 'obj-2',
        interactionType: 'email',
        body: 'Demande de RDV photo.',
        topicCode: 'demande_de_visite',
        sentimentCode: 'positif',
      }),
    );
    // Refresh après écriture : la fiche est rechargée depuis le RPC.
    await waitFor(() => expect(crmMock.listActorCrm).toHaveBeenCalledTimes(2));
  });

  it('sans contexte choisi, consigne au seul acteur (pas d objectId)', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Point général.' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    await waitFor(() => expect(crmMock.saveCrmInteraction).toHaveBeenCalled());
    expect(crmMock.saveCrmInteraction.mock.calls[0][0]).toEqual({
      actorId: 'actor-1',
      interactionType: 'call',
      body: 'Point général.',
    });
  });

  it('échec de consignation → erreur visible, saisie conservée', async () => {
    crmMock.saveCrmInteraction.mockRejectedValue(new Error('refus RLS'));
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Texte conservé' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    expect(await screen.findByText(/refus RLS/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/consigner une interaction/i)).toHaveValue('Texte conservé');
  });

  it('sans permission : composer désactivé avec raison (no-write-trap)', async () => {
    renderFiche({ canWrite: false });
    await screen.findByText('Appel tarifs');
    expect(screen.getByPlaceholderText(/consigner une interaction/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /consigner/i })).toBeDisabled();
    expect(screen.getAllByText(/lecture seule/i).length).toBeGreaterThan(0);
  });

  it('42501 (acteur hors périmètre) → message dédié', async () => {
    crmMock.listActorCrm.mockRejectedValue(Object.assign(new Error('permission denied'), { code: '42501' }));
    renderFiche();
    expect(await screen.findByText(/hors de votre périmètre/i)).toBeInTheDocument();
  });
});
