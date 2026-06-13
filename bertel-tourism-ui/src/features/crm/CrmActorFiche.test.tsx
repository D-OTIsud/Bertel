import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmActorFiche } from './CrmActorFiche';
import * as crm from '../../services/crm';
import type { ActorCrmSnapshot } from '../../services/crm';

jest.mock('../../services/crm');

const crmMock = crm as jest.Mocked<typeof crm>;

const snapshot: ActorCrmSnapshot = {
  actor: { id: 'actor-1', displayName: 'Mme Marie Hoarau', firstName: 'Marie', lastName: 'Hoarau', photoUrl: null },
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
      // topicName null ⇒ le titre de la carte = le subject (« Appel tarifs ») — les assertions
      // de contexte/filtre s'ancrent dessus. La couverture du fallback topicName→subject→type
      // est testée à l'unité dans crm-primitives.test.tsx.
      id: 'i1', actorId: 'actor-1', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', interactionType: 'call',
      direction: 'outbound', status: 'done', subject: 'Appel tarifs', body: 'Tarifs 2026 validés.',
      occurredAt: '2026-06-04T10:00:00Z', actorName: null, topicCode: 'modification_infos_bdd',
      topicName: null, sentimentCode: 'positif', sentimentName: 'Positif',
      ownerName: 'Florence', source: 'bertel_ui', interlocutorEmail: null, resolvedAt: null, replies: [],
    },
    {
      id: 'i2', actorId: 'actor-1', objectId: 'obj-2', objectName: 'Le Comptoir des Epices', interactionType: 'email',
      direction: 'outbound', status: 'done', subject: 'Photos plats', body: null,
      occurredAt: '2026-05-18T08:00:00Z', actorName: null, topicCode: null, topicName: null,
      sentimentCode: 'inquiet', sentimentName: 'Inquiet', ownerName: 'Jean', source: 'bertel_ui',
      interlocutorEmail: null, resolvedAt: null, replies: [],
    },
    {
      id: 'i3', actorId: 'actor-1', objectId: null, objectName: null, interactionType: 'note',
      direction: 'internal', status: 'done', subject: 'Vœux annuels', body: 'Tour d’horizon.',
      occurredAt: '2026-01-08T09:00:00Z', actorName: null, topicCode: null, topicName: null,
      sentimentCode: null, sentimentName: null, ownerName: 'Florence', source: 'bertel_ui',
      interlocutorEmail: null, resolvedAt: null, replies: [],
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
  // Assignation (PO point 4) : 2 membres ; le 1er = utilisateur courant démo (usr-local-marie).
  crmMock.listCrmAssignees.mockResolvedValue([
    { userId: 'usr-local-marie', displayName: 'Marie D.' },
    { userId: 'usr-local-jean', displayName: 'Jean P.' },
  ]);
});

describe('CrmActorFiche (§61 — fiche acteur 360°)', () => {
  it('rend la carte acteur (identité réelle en sous-ligne), les établissements liés et le badge principal', async () => {
    renderFiche();
    expect(await screen.findByText('Mme Marie Hoarau')).toBeInTheDocument();
    // Rectif PO point 4 : prénom/nom réels sous le nom affiché.
    expect(screen.getByText('Marie Hoarau')).toBeInTheDocument();
    // Cartes établissements : nom + rôle + badge principal sur le lien primaire.
    expect(screen.getByText('Gérante')).toBeInTheDocument();
    expect(screen.getByText('Propriétaire')).toBeInTheDocument();
    expect(screen.getAllByText('principal').length).toBeGreaterThan(0);
    // KPI réels (rail droit).
    expect(screen.getByText('Interactions · 12 mois')).toBeInTheDocument();
    expect(screen.getByText('Sujets distincts')).toBeInTheDocument();
  });

  // Rectif PO §66+ point 3 : les pills redondantes « N établissements » / « N interactions »
  // sous le nom sont SUPPRIMÉES (elles doublonnaient les KPI Établissements / Interactions).
  it('les pills redondantes « N établissements » / « N interactions » ne sont plus rendues', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    expect(screen.queryByText('2 établissements')).not.toBeInTheDocument();
    expect(screen.queryByText('3 interactions')).not.toBeInTheDocument();
    // Aucune pill-mini dans la carte acteur (la seule pill-mini autorisée est le badge « principal »).
    const card = document.querySelector('.crm-actor-card') as HTMLElement;
    const pills = Array.from(card.querySelectorAll('.pill-mini'));
    expect(pills.every((pill) => pill.textContent === 'principal')).toBe(true);
  });

  // Rectif PO §66+ points 1+2 : Coordonnées EN VERTICAL (liste, un canal par ligne) et CLIQUABLES :
  // e-mail → mailto:, téléphone → tel: (sans espaces dans le href).
  it('carte acteur Coordonnées : liste verticale cliquable (mailto / tel sans espaces)', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    const coords = screen.getByLabelText('Coordonnées');
    // La liste vit dans la carte acteur du rail.
    expect(coords.closest('.crm-actor-card')).not.toBeNull();
    expect(coords.tagName).toBe('UL');
    // E-mail cliquable → mailto:.
    const emailLink = within(coords).getByRole('link', { name: 'marie@basalte.re' });
    expect(emailLink).toHaveAttribute('href', 'mailto:marie@basalte.re');
    // Téléphone cliquable → tel: SANS les espaces (libellé affiché conserve le formatage).
    const phoneLink = within(coords).getByRole('link', { name: '0262 12 34 56' });
    expect(phoneLink).toHaveAttribute('href', 'tel:0262123456');
    // Badge « principal » conservé.
    expect(within(coords).getByText('principal')).toBeInTheDocument();
  });

  // Rectif PO §66+ point 4 : la carte acteur (avatar + nom + coordonnées + Modifier) vit dans la
  // colonne DROITE (rail). Le bouton « Modifier » y est, actif avec permission.
  it('carte acteur : Modifier dans la carte du rail, actif avec permission', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    const editBtn = screen.getByRole('button', { name: /^modifier$/i });
    expect(editBtn).toBeEnabled();
    expect(editBtn.closest('.crm-actor-card')).not.toBeNull();
    expect(editBtn.closest('.crm-actor-grid__side')).not.toBeNull();
  });

  // Rectif PO §66+ : le rail droit ne contient pas de carte rail (.rcard) « Coordonnées »
  // (les coordonnées sont dans la carte acteur, pas une rcard séparée).
  it('le rail droit ne contient pas de rcard Coordonnées', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    expect(screen.queryByRole('group', { name: /établissements & rôles/i })).toBeInTheDocument();
    const railCards = Array.from(document.querySelectorAll('.crm-actor-grid__side .rcard'));
    expect(railCards.some((card) => card.getAttribute('aria-label') === 'Coordonnées')).toBe(false);
  });

  it('carte acteur Coordonnées : état vide explicite sans canal', async () => {
    crmMock.listActorCrm.mockResolvedValue({ ...snapshot, channels: [] });
    renderFiche();
    await screen.findByText('Appel tarifs');
    expect(screen.getByText('Aucun canal renseigné.')).toBeInTheDocument();
  });

  // Rectif PO §66+ points 4+5 : structure deux colonnes. À DROITE (.crm-actor-grid__side) : carte
  // acteur + KPI + « Établissements & rôles » + « Sujets récurrents ». À GAUCHE
  // (.crm-actor-grid__main) : les actions + la timeline.
  it('structure deux colonnes : KPI + rails à droite, actions + timeline à gauche', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    const side = document.querySelector('.crm-actor-grid__side') as HTMLElement;
    const main = document.querySelector('.crm-actor-grid__main') as HTMLElement;
    expect(side).not.toBeNull();
    expect(main).not.toBeNull();
    // Colonne DROITE : KPI + « Établissements & rôles » + « Sujets récurrents ».
    expect(within(side).getByText('Interactions · 12 mois')).toBeInTheDocument();
    expect(within(side).getByText('Établissements & rôles')).toBeInTheDocument();
    expect(within(side).getByText('Sujets récurrents')).toBeInTheDocument();
    expect(side.querySelector('.crm-actor-kpis')).not.toBeNull();
    // Colonne GAUCHE : les deux boutons d'action + la timeline.
    expect(within(main).getByRole('button', { name: /nouvelle tâche/i })).toBeInTheDocument();
    expect(within(main).getByRole('button', { name: /nouvelle interaction/i })).toBeInTheDocument();
    expect(main.querySelector('.crm-actor-actions')).not.toBeNull();
    expect(within(main).getByText('Appel tarifs')).toBeInTheDocument();
    // Les actions ne sont PAS dans le rail droit.
    expect(within(side).queryByRole('button', { name: /nouvelle interaction/i })).not.toBeInTheDocument();
  });

  // Rectif PO §66+ point 6 : un toggle mobile « Voir les indicateurs » contrôle la région
  // repliable (KPI + listes). Présent dans le DOM (CSS le masque ≥ breakpoint), aria-expanded + controls.
  it('mobile : le toggle « Voir les indicateurs » existe et contrôle la région repliable', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    const toggle = screen.getByRole('button', { name: /voir les indicateurs/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const controlled = toggle.getAttribute('aria-controls');
    expect(controlled).toBeTruthy();
    const region = document.getElementById(controlled as string);
    expect(region).not.toBeNull();
    expect(region).toHaveClass('crm-actor-collapsible');
    // Toggle → déplie (is-open + aria-expanded passe à true).
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /masquer les indicateurs/i })).toHaveAttribute('aria-expanded', 'true');
    expect(region).toHaveClass('is-open');
  });

  // Rectif PO v5 point 1 : la chip « Sujets récurrents » porte une teinte stable (topic--N).
  it('la chip Sujets récurrents porte une classe de teinte topic--N', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    const chip = screen.getByText(/Modification infos BDD — 2/).closest('.topic-chip') as HTMLElement;
    expect(chip).toHaveClass('topic-pill');
    expect(Array.from(chip.classList).some((c) => /^topic--\d+$/.test(c))).toBe(true);
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

  // PO point 2 : le champ de saisie de l'interaction est multi-lignes (≥ 4 lignes).
  it('le champ texte de l interaction est un textarea d au moins 4 lignes', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle interaction/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle interaction' });
    const field = within(dialog).getByPlaceholderText(/consigner une interaction/i);
    expect(field.tagName).toBe('TEXTAREA');
    expect(Number(field.getAttribute('rows'))).toBeGreaterThanOrEqual(4);
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

  // Rectif PO point 3 + assignation PO point 4 : nouvelle tâche DEPUIS la fiche, ancrée
  // objet + rattachée acteur + assignée (défaut = utilisateur courant, ici Marie).
  it('Nouvelle tâche depuis la fiche → saveCrmTask({objectId, actorId, title, dueAt, owner})', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle tâche/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle tâche' });
    fireEvent.change(within(dialog).getByLabelText('Titre de la tâche'), { target: { value: 'Relancer les photos' } });
    fireEvent.change(within(dialog).getByLabelText('Établissement'), { target: { value: 'obj-2' } });
    fireEvent.change(within(dialog).getByLabelText('Échéance'), { target: { value: '2026-06-20' } });
    // Assignation par défaut = utilisateur courant (usr-local-marie) ; attendre la liste chargée.
    await within(dialog).findByLabelText('Attribuer à');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(crmMock.saveCrmTask).toHaveBeenCalledWith({
        objectId: 'obj-2',
        actorId: 'actor-1',
        title: 'Relancer les photos',
        dueAt: '2026-06-20',
        owner: 'usr-local-marie',
      }),
    );
  });

  // Assignation PO point 4 : le sélecteur « Attribuer à » change le owner envoyé.
  it('Assigner à un autre membre → saveCrmTask owner = membre choisi', async () => {
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle tâche/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle tâche' });
    fireEvent.change(within(dialog).getByLabelText('Titre de la tâche'), { target: { value: 'Relancer' } });
    fireEvent.change(within(dialog).getByLabelText('Établissement'), { target: { value: 'obj-1' } });
    fireEvent.change(await within(dialog).findByLabelText('Attribuer à'), { target: { value: 'usr-local-jean' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(crmMock.saveCrmTask).toHaveBeenCalledWith(expect.objectContaining({ owner: 'usr-local-jean' })),
    );
  });

  // Auto-sélection PO point 3 : un acteur à UN SEUL établissement → établissement pré-coché.
  it('un acteur mono-établissement : le select établissement est pré-sélectionné', async () => {
    crmMock.listActorCrm.mockResolvedValue({
      ...snapshot,
      objects: [snapshot.objects[0]], // un seul établissement (obj-1)
    });
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle tâche/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle tâche' });
    // Pré-coché : pas besoin de choisir l'établissement, juste le titre.
    expect(within(dialog).getByLabelText('Établissement')).toHaveValue('obj-1');
    fireEvent.change(within(dialog).getByLabelText('Titre de la tâche'), { target: { value: 'Relancer' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(crmMock.saveCrmTask).toHaveBeenCalledWith(expect.objectContaining({ objectId: 'obj-1' })),
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

  // Revue (fix 1) : chaque opération appliquée est committée dans l'état local dès son succès —
  // un retry après échec partiel ne rejoue QUE les opérations restantes (sinon re-delete → P0002,
  // ré-insert → doublon 23505 : le retry ne pouvait jamais aboutir).
  it('un échec partiel puis retry n applique que les opérations restantes', async () => {
    crmMock.deleteActorChannel.mockRejectedValueOnce(new Error('réseau indisponible'));
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /^modifier$/i }));
    const dialog = await screen.findByRole('dialog', { name: "Modifier l'acteur" });
    // Identité modifiée (UPDATE) + canal 1 modifié (UPDATE) + canal 2 supprimé (DELETE, échoue
    // au 1er submit) + nouvelle ligne (INSERT, jamais atteinte au 1er submit).
    fireEvent.change(within(dialog).getByLabelText('Nom affiché'), { target: { value: 'Mme Marie Hoarau-Payet' } });
    fireEvent.change(within(dialog).getByLabelText('Valeur du canal 1'), { target: { value: 'marie@lagon.re' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer le canal 2' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /ajouter un canal/i }));
    fireEvent.change(within(dialog).getByLabelText('Valeur du canal 3'), { target: { value: '0692 11 22 33' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    // 1er submit : identité + update canal 1 passent, le DELETE échoue → erreur inline, modal ouvert.
    expect(await within(dialog).findByText(/réseau indisponible/)).toBeInTheDocument();
    expect(crmMock.saveCrmActor).toHaveBeenCalledTimes(1);
    expect(crmMock.saveActorChannel).toHaveBeenCalledTimes(1); // update canal 1 seulement
    expect(crmMock.deleteActorChannel).toHaveBeenCalledTimes(1);
    // Retry : seules les opérations restantes partent (DELETE rejoué + INSERT) — ni l'identité
    // ni l'update du canal 1 déjà appliqués ne sont re-soumis.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(crmMock.saveCrmActor).toHaveBeenCalledTimes(1);
    expect(crmMock.deleteActorChannel).toHaveBeenCalledTimes(2);
    expect(crmMock.saveActorChannel).toHaveBeenCalledTimes(2);
    expect(crmMock.saveActorChannel.mock.calls[1][0]).toEqual({
      actorId: 'actor-1',
      kindCode: 'phone',
      value: '0692 11 22 33',
      isPrimary: false,
    });
  });

  // Revue (fix 2) : déplacement du badge principal entre deux canaux de même kind — l'op qui
  // LIBÈRE le principal doit partir AVANT celle qui le POSE, sinon l'index unique partiel
  // « un principal par kind » rejette en 23505 quand le poseur précède dans l'ordre des lignes.
  it('déplacer le badge principal : l unset part avant le set', async () => {
    crmMock.listActorCrm.mockResolvedValue({
      ...snapshot,
      channels: [
        { id: 'ch-1', kindCode: 'phone', kindName: 'Téléphone', value: '0262 11 11 11', isPrimary: false },
        { id: 'ch-2', kindCode: 'phone', kindName: 'Téléphone', value: '0692 22 22 22', isPrimary: true },
      ],
    });
    renderFiche();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /^modifier$/i }));
    const dialog = await screen.findByRole('dialog', { name: "Modifier l'acteur" });
    // Swap : le canal 1 (plus HAUT dans la liste) gagne le principal, le canal 2 le perd.
    fireEvent.click(within(dialog).getByLabelText('Canal 1 principal'));
    fireEvent.click(within(dialog).getByLabelText('Canal 2 principal'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(crmMock.saveActorChannel).toHaveBeenCalledTimes(2));
    expect(crmMock.saveCrmActor).not.toHaveBeenCalled(); // identité inchangée
    // Ordre : l'UPDATE qui retire is_primary (ch-2) part AVANT celui qui le pose (ch-1).
    expect(crmMock.saveActorChannel.mock.calls[0][0]).toEqual({
      id: 'ch-2',
      kindCode: 'phone',
      value: '0692 22 22 22',
      isPrimary: false,
    });
    expect(crmMock.saveActorChannel.mock.calls[1][0]).toEqual({
      id: 'ch-1',
      kindCode: 'phone',
      value: '0262 11 11 11',
      isPrimary: true,
    });
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

  // §65/§66 — répondre dans la timeline de la fiche : saveCrmInteraction({parentInteractionId}) +
  // refetch list_actor_crm. La réponse n'envoie PAS actorId/objectId (le serveur hérite la racine).
  it('Répondre depuis la fiche → saveCrmInteraction({ parentInteractionId }) puis recharge la fiche', async () => {
    renderFiche();
    const card = (await screen.findByText('Tarifs 2026 validés.')).closest('.tl-card') as HTMLElement;
    const actionsBar = card.querySelector('.tl-actions') as HTMLElement;
    fireEvent.click(within(actionsBar).getByRole('button', { name: /répondre/i }));
    const composer = card.querySelector('.tl-reply-composer') as HTMLElement;
    fireEvent.change(within(composer).getByPlaceholderText(/votre réponse/i), { target: { value: 'Réponse fiche.' } });
    fireEvent.click(within(composer).getByRole('button', { name: /envoyer/i }));
    await waitFor(() =>
      expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith({ parentInteractionId: 'i1', body: 'Réponse fiche.' }),
    );
    await waitFor(() => expect(crmMock.listActorCrm).toHaveBeenCalledTimes(2));
  });

  // §65/§66 — i1 est 'done' ⇒ le bouton bascule sur « Rouvrir » → status planned.
  it('Rouvrir une interaction traitée → saveCrmInteraction({ id, status: planned })', async () => {
    renderFiche();
    const card = (await screen.findByText('Tarifs 2026 validés.')).closest('.tl-card') as HTMLElement;
    const actionsBar = card.querySelector('.tl-actions') as HTMLElement;
    fireEvent.click(within(actionsBar).getByRole('button', { name: /rouvrir/i }));
    await waitFor(() => expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith({ id: 'i1', status: 'planned' }));
  });

  // Gating (no-write-trap) : sans permission, les actions du fil sont désactivées avec raison.
  it('sans permission : Répondre / Rouvrir du fil désactivés', async () => {
    renderFiche({ canWrite: false });
    const card = (await screen.findByText('Tarifs 2026 validés.')).closest('.tl-card') as HTMLElement;
    const actionsBar = card.querySelector('.tl-actions') as HTMLElement;
    expect(within(actionsBar).getByRole('button', { name: /répondre/i })).toBeDisabled();
    expect(within(actionsBar).getByRole('button', { name: /rouvrir/i })).toBeDisabled();
  });
});
