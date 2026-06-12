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
  channels: [
    { id: 'ch-1', kindCode: 'email', kindName: 'Email', value: 'marie@basalte.re', isPrimary: true },
    { id: 'ch-2', kindCode: 'phone', kindName: 'Téléphone', value: '0262 12 34 56', isPrimary: false },
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
  crmMock.listContactKinds.mockResolvedValue([
    { code: 'phone', name: 'Téléphone' },
    { code: 'email', name: 'Email' },
  ]);
  crmMock.saveCrmInteraction.mockResolvedValue('new-interaction');
  crmMock.saveCrmTask.mockResolvedValue('new-task');
  crmMock.saveCrmActor.mockResolvedValue('actor-1');
  crmMock.saveActorChannel.mockResolvedValue('new-channel');
  crmMock.deleteActorChannel.mockResolvedValue(undefined);
});

describe('CrmActorFiche (§61 — fiche acteur 360°)', () => {
  it('rend le hero (identité réelle en sous-ligne), les établissements liés et le badge principal', async () => {
    renderFiche();
    expect(await screen.findByText('Mme Marie Hoarau')).toBeInTheDocument();
    // Rectif PO point 4 : prénom/nom réels sous le nom affiché.
    expect(screen.getByText('Marie Hoarau')).toBeInTheDocument();
    expect(screen.getByText('2 établissements')).toBeInTheDocument();
    expect(screen.getByText('3 interactions')).toBeInTheDocument();
    // Cartes établissements : nom + rôle + badge principal sur le lien primaire.
    expect(screen.getByText('Gérante')).toBeInTheDocument();
    expect(screen.getByText('Propriétaire')).toBeInTheDocument();
    expect(screen.getAllByText('principal').length).toBeGreaterThan(0);
    // Stats réelles.
    expect(screen.getByText('Interactions · 12 mois')).toBeInTheDocument();
    expect(screen.getByText('Sujets distincts')).toBeInTheDocument();
  });

  // Rectif PO point 4 : les coordonnées réelles de la personne, en premier dans le rail.
  it('rail Coordonnées : canaux réels (valeur + badge principal) et bouton Modifier', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    const coords = screen.getByRole('group', { name: 'Coordonnées' });
    expect(within(coords).getByText('marie@basalte.re')).toBeInTheDocument();
    expect(within(coords).getByText('0262 12 34 56')).toBeInTheDocument();
    expect(within(coords).getByText('principal')).toBeInTheDocument();
    expect(within(coords).getByRole('button', { name: /modifier/i })).toBeEnabled();
  });

  it('rail Coordonnées : état vide explicite sans canal', async () => {
    crmMock.listActorCrm.mockResolvedValue({ ...snapshot, channels: [] });
    renderFiche();
    await screen.findByText('Appel tarifs');
    expect(screen.getByText('Aucun canal renseigné.')).toBeInTheDocument();
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

  // Rectif PO point 3 : le composer vit dans un modal.
  it('le modal Nouvelle interaction consigne avec actorId + objectId + codes puis recharge la fiche', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle interaction/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle interaction' });
    fireEvent.click(within(dialog).getByRole('button', { name: /e-mail/i }));
    fireEvent.change(within(dialog).getByLabelText('Contexte'), { target: { value: 'obj-2' } });
    fireEvent.change(within(dialog).getByLabelText('Sujet normalisé'), { target: { value: 'demande_de_visite' } });
    fireEvent.change(within(dialog).getByLabelText('Sentiment'), { target: { value: 'positif' } });
    fireEvent.change(within(dialog).getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Demande de RDV photo.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /consigner/i }));
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
    // Refresh après écriture : la fiche est rechargée depuis le RPC, et le modal se ferme.
    await waitFor(() => expect(crmMock.listActorCrm).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sans contexte choisi, consigne au seul acteur (pas d objectId)', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle interaction/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle interaction' });
    fireEvent.change(within(dialog).getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Point général.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /consigner/i }));
    await waitFor(() => expect(crmMock.saveCrmInteraction).toHaveBeenCalled());
    expect(crmMock.saveCrmInteraction.mock.calls[0][0]).toEqual({
      actorId: 'actor-1',
      interactionType: 'call',
      body: 'Point général.',
    });
  });

  it('échec de consignation → erreur visible dans le modal, saisie conservée', async () => {
    crmMock.saveCrmInteraction.mockRejectedValue(new Error('refus RLS'));
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle interaction/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle interaction' });
    fireEvent.change(within(dialog).getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Texte conservé' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /consigner/i }));
    expect(await within(dialog).findByText(/refus RLS/)).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText(/consigner une interaction/i)).toHaveValue('Texte conservé');
  });

  // Rectif PO point 3 : nouvelle tâche DEPUIS la fiche, ancrée objet + rattachée acteur.
  it('Nouvelle tâche depuis la fiche → saveCrmTask({objectId, actorId, title, dueAt})', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle tâche/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle tâche' });
    fireEvent.change(within(dialog).getByLabelText('Titre de la tâche'), { target: { value: 'Relancer les photos' } });
    fireEvent.change(within(dialog).getByLabelText('Établissement'), { target: { value: 'obj-2' } });
    fireEvent.change(within(dialog).getByLabelText('Échéance'), { target: { value: '2026-06-20' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(crmMock.saveCrmTask).toHaveBeenCalledWith({
        objectId: 'obj-2',
        actorId: 'actor-1',
        title: 'Relancer les photos',
        dueAt: '2026-06-20',
      }),
    );
  });

  // Rectif PO point 4 : édition identité + canaux (diff appliqué canal par canal).
  it('Modifier → saveCrmActor UPDATE + update/delete/insert des canaux', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /^modifier$/i }));
    const dialog = await screen.findByRole('dialog', { name: "Modifier l'acteur" });
    // Identité.
    fireEvent.change(within(dialog).getByLabelText('Nom affiché'), { target: { value: 'Mme Marie Hoarau-Payet' } });
    // Canal 1 (ch-1) : valeur modifiée → UPDATE.
    fireEvent.change(within(dialog).getByLabelText('Valeur du canal 1'), { target: { value: 'marie@lagon.re' } });
    // Canal 2 (ch-2) : supprimé → DELETE.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer le canal 2' }));
    // Nouvelle ligne : kind par défaut (phone) + valeur → INSERT.
    fireEvent.click(within(dialog).getByRole('button', { name: /ajouter un canal/i }));
    fireEvent.change(within(dialog).getByLabelText('Valeur du canal 3'), { target: { value: '0692 11 22 33' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(crmMock.saveCrmActor).toHaveBeenCalledWith({
        id: 'actor-1',
        displayName: 'Mme Marie Hoarau-Payet',
        firstName: 'Marie',
        lastName: 'Hoarau',
      }),
    );
    await waitFor(() =>
      expect(crmMock.saveActorChannel).toHaveBeenCalledWith({
        id: 'ch-1',
        kindCode: 'email',
        value: 'marie@lagon.re',
        isPrimary: true,
      }),
    );
    expect(crmMock.deleteActorChannel).toHaveBeenCalledWith('ch-2');
    expect(crmMock.saveActorChannel).toHaveBeenCalledWith({
      actorId: 'actor-1',
      kindCode: 'phone',
      value: '0692 11 22 33',
      isPrimary: false,
    });
    // Refresh fiche + annuaire après écriture confirmée.
    await waitFor(() => expect(crmMock.listActorCrm).toHaveBeenCalledTimes(2));
  });

  it('échec d édition → erreur visible dans le modal (resté ouvert)', async () => {
    crmMock.saveCrmActor.mockRejectedValue(new Error('refus RLS'));
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /^modifier$/i }));
    const dialog = await screen.findByRole('dialog', { name: "Modifier l'acteur" });
    fireEvent.change(within(dialog).getByLabelText('Nom affiché'), { target: { value: 'Autre nom' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText(/refus RLS/)).toBeInTheDocument();
  });

  // Assertion verrouillée par revue : gating lecture seule (no-write-trap).
  it('sans permission : actions désactivées avec raison (interaction, tâche, modifier)', async () => {
    renderFiche({ canWrite: false });
    await screen.findByText('Appel tarifs');
    expect(screen.getByRole('button', { name: /nouvelle interaction/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /nouvelle tâche/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^modifier$/i })).toBeDisabled();
    expect(screen.getAllByText(/lecture seule/i).length).toBeGreaterThan(0);
  });

  it('42501 (acteur hors périmètre) → message dédié', async () => {
    crmMock.listActorCrm.mockRejectedValue(Object.assign(new Error('permission denied'), { code: '42501' }));
    renderFiche();
    expect(await screen.findByText(/hors de votre périmètre/i)).toBeInTheDocument();
  });
});
