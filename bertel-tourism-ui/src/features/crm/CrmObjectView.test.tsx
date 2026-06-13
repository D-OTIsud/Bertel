import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmObjectView } from './CrmObjectView';
import * as crm from '../../services/crm';
import type { ObjectCrmSnapshot } from '../../services/crm';
import { mockCrmDirectory } from '../../data/mock';

jest.mock('../../services/crm');

const crmMock = crm as jest.Mocked<typeof crm>;

const snapshot: ObjectCrmSnapshot = {
  interactions: [
    {
      // topicName null ⇒ titre de carte = subject (« Appel tarifs »), ancre des assertions
      // existantes ; le fallback de titre est couvert à l'unité dans crm-primitives.test.tsx.
      // actorId porté DIRECTEMENT par l'interaction (contrat backend) — le clic carte l'utilise.
      id: 'i1', interactionType: 'call', subject: 'Appel tarifs', body: 'Tarifs validés.',
      occurredAt: '2026-06-04T10:00:00Z', actorId: 'actor-1', actorName: 'Mme Marie Hoarau',
      topicCode: 'modification_infos_bdd', topicName: null,
      sentimentCode: 'positif', sentimentName: 'Positif', ownerName: 'Florence', source: 'bertel_ui',
      // §66 : list_object_crm porte `status` ⇒ la vue objet rend la chip « En attente » (planned).
      interlocutorEmail: null, status: 'planned', resolvedAt: null,
      replies: [{
        id: 'i1-r1', interactionType: 'note', body: 'Tarifs intégrés dans la fiche.',
        occurredAt: '2026-06-05T08:00:00Z', createdAt: '2026-06-05T08:01:00Z',
        sentimentCode: null, sentimentName: null, ownerName: 'Florence', interlocutorEmail: null, source: 'bertel_ui',
      }],
    },
    {
      // actorId null : interaction ancrée au seul objet ⇒ carte non cliquable (pas de faux lien).
      // owner_name null + source import + interlocutor_email ⇒ l'auteur affiché = l'interlocuteur
      // (fix « par Système » : plus jamais « par Système » quand une demande entrante est connue).
      id: 'i2', interactionType: 'email', subject: 'Adhésion 2026', body: null,
      occurredAt: '2026-03-24T09:00:00Z', actorId: null, actorName: 'SARL Basalte & Lagon',
      topicCode: null, topicName: null, sentimentCode: null, sentimentName: null,
      ownerName: null, source: 'import_berta2_crm', interlocutorEmail: 'contact@basalte.re',
      status: 'done', resolvedAt: '2026-03-25T09:00:00Z', replies: [],
    },
  ],
  topics: [{ code: 'modification_infos_bdd', name: 'Modification infos BDD', count: 1 }],
  actors: [
    { actorId: 'actor-1', displayName: 'Mme Marie Hoarau', photoUrl: 'https://cdn/actors/actor-1/p.jpg', roleCode: 'manager', roleName: 'Gérante', isPrimary: true },
    { actorId: 'actor-2', displayName: 'SARL Basalte & Lagon', photoUrl: null, roleCode: 'operator', roleName: 'Exploitant', isPrimary: false },
  ],
  tasks: [],
};

function renderView(overrides: Partial<Parameters<typeof CrmObjectView>[0]> = {}) {
  const props = {
    objectId: 'obj-1',
    backLabel: 'Annuaire des acteurs',
    canWrite: true,
    onBack: jest.fn(),
    onOpenActor: jest.fn(),
    ...overrides,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CrmObjectView {...props} />
    </QueryClientProvider>,
  );
  return props;
}

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listObjectCrm.mockResolvedValue(snapshot);
  crmMock.listCrmDirectory.mockResolvedValue(mockCrmDirectory);
  crmMock.listDemandTopics.mockResolvedValue([{ code: 'demande_de_visite', name: 'Demande de visite' }]);
  crmMock.saveCrmInteraction.mockResolvedValue('new-interaction');
  crmMock.deleteCrmInteraction.mockResolvedValue(undefined);
});

describe('CrmObjectView (§61 — vue établissement)', () => {
  it('résout nom + type depuis l annuaire et rend le lien éditeur', async () => {
    renderView();
    expect(await screen.findByText('Hotel Basalte & Lagon')).toBeInTheDocument();
    expect(screen.getByText('HOT')).toBeInTheDocument();
    const editorLink = screen.getByRole('link', { name: /ouvrir dans l.éditeur/i });
    expect(editorLink).toHaveAttribute('href', '/objects/obj-1/edit');
  });

  it('rend les acteurs liés avec rôle + badge principal ; clic → onOpenActor', async () => {
    const props = renderView();
    await screen.findByText('Hotel Basalte & Lagon');
    expect(screen.getByText('Gérante')).toBeInTheDocument();
    expect(screen.getByText('Exploitant')).toBeInTheDocument();
    expect(screen.getByText('principal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sarl basalte & lagon exploitant/i }));
    expect(props.onOpenActor).toHaveBeenCalledWith('actor-2');
  });

  // PO point 4 : le Pav rend le PORTRAIT (img) quand photoUrl est présent (actor-1), et garde
  // les initiales sinon (actor-2, photoUrl null) — pas d'image fantôme. L'img porte alt=""
  // (décoratif, le nom est rendu à côté) ⇒ requête par balise, pas par rôle.
  it('rail acteurs : Pav rend une img pour la photo, des initiales sans', async () => {
    renderView();
    const rail = await screen.findByRole('group', { name: /acteurs liés/i });
    const imgs = rail.querySelectorAll('.pav--photo img');
    expect(imgs).toHaveLength(1); // seul actor-1 a une photo
    expect(imgs[0]).toHaveAttribute('src', 'https://cdn/actors/actor-1/p.jpg');
    // actor-2 (sans photo) garde des initiales teintées (pas de .pav--photo).
    expect(rail.querySelectorAll('.pav:not(.pav--photo)').length).toBeGreaterThan(0);
  });

  it('historique tous acteurs confondus : chaque carte porte le QUI (actorName)', async () => {
    renderView();
    await screen.findByText('Appel tarifs');
    expect(screen.getByText('Adhésion 2026')).toBeInTheDocument();
    // WHO par carte — les deux acteurs apparaissent dans le flux.
    expect(screen.getAllByText('Mme Marie Hoarau').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SARL Basalte & Lagon').length).toBeGreaterThan(0);
  });

  // Rectif PO v5 point 5 : dans l'historique objet, cliquer une carte ouvre la fiche de l'acteur.
  // list_object_crm porte désormais actor_id par interaction ⇒ le clic l'utilise DIRECTEMENT
  // (plus de résolution par nom). Une interaction sans actor_id ⇒ carte non cliquable.
  it('clic sur une carte de l historique → onOpenActor(actorId de l interaction)', async () => {
    const props = renderView();
    // i1 (actorId 'actor-1') : on cible la carte par son corps. A11y (§66) : c'est la sous-région
    // .tl-card__nav qui porte role=button (la carte est un conteneur neutre).
    const card = (await screen.findByText('Tarifs validés.')).closest('.tl-card') as HTMLElement;
    expect(card).not.toHaveAttribute('role', 'button');
    const nav = card.querySelector('.tl-card__nav') as HTMLElement;
    expect(nav).toHaveAttribute('role', 'button');
    fireEvent.click(nav);
    expect(props.onOpenActor).toHaveBeenCalledWith('actor-1');
    // i2 (actorId null) : région NON cliquable (pas de role button), clic sans effet.
    const nav2 = (screen.getByText('Adhésion 2026').closest('.tl-card') as HTMLElement).querySelector('.tl-card__nav') as HTMLElement;
    expect(nav2).not.toHaveAttribute('role', 'button');
    fireEvent.click(nav2);
    expect(props.onOpenActor).toHaveBeenCalledTimes(1);
  });

  it('bouton retour avec le libellé d origine', async () => {
    const props = renderView({ backLabel: 'Mme Marie Hoarau' });
    // Nom accessible EXACT : ne matche que le bouton retour, pas la ligne acteur du rail.
    fireEvent.click(await screen.findByRole('button', { name: 'Mme Marie Hoarau' }));
    expect(props.onBack).toHaveBeenCalled();
  });

  it('échec de chargement → erreur visible', async () => {
    crmMock.listObjectCrm.mockRejectedValue(new Error('refus RLS'));
    renderView();
    expect(await screen.findByText(/refus RLS/)).toBeInTheDocument();
  });

  // Rectif PO point 3 : consigner une interaction depuis la vue établissement, via modal
  // (contexte FIXÉ sur l'objet, acteur optionnel parmi les acteurs liés).
  it('Nouvelle interaction (modal, contexte fixé) → saveCrmInteraction({objectId, actorId?}) + refresh', async () => {
    renderView();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle interaction/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle interaction' });
    // Contexte non éditable : l'objet courant est affiché en statique.
    expect(within(dialog).getByText('Hotel Basalte & Lagon')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Contexte')).not.toBeInTheDocument();
    // Acteur optionnel parmi les acteurs liés.
    fireEvent.change(within(dialog).getByLabelText('Acteur'), { target: { value: 'actor-2' } });
    fireEvent.change(within(dialog).getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Point annuel.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /consigner/i }));
    await waitFor(() =>
      expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith({
        actorId: 'actor-2',
        objectId: 'obj-1',
        interactionType: 'call',
        body: 'Point annuel.',
      }),
    );
    // Refresh de la vue objet après écriture confirmée.
    await waitFor(() => expect(crmMock.listObjectCrm).toHaveBeenCalledTimes(2));
  });

  // PO point 2 : champ multi-lignes dans le modal interaction de la vue établissement aussi.
  it('le champ texte de l interaction (vue établissement) est un textarea ≥ 4 lignes', async () => {
    renderView();
    await screen.findByText('Appel tarifs');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle interaction/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle interaction' });
    const field = within(dialog).getByPlaceholderText(/consigner une interaction/i);
    expect(field.tagName).toBe('TEXTAREA');
    expect(Number(field.getAttribute('rows'))).toBeGreaterThanOrEqual(4);
  });

  it('sans permission : Nouvelle interaction désactivée avec raison (no-write-trap)', async () => {
    renderView({ canWrite: false });
    await screen.findByText('Appel tarifs');
    const button = screen.getByRole('button', { name: /nouvelle interaction/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringMatching(/lecture seule/i));
  });

  // §66 — la chip de statut (« En attente » / « Traitée ») s'affiche dans la vue objet : le
  // parcours mappe désormais status: item.status (était hard-codé null ⇒ chip jamais rendue).
  it('rend la chip de statut de la demande (En attente / Traitée) dans la vue objet', async () => {
    renderView();
    await screen.findByText('Appel tarifs');
    // i1 = planned ⇒ « En attente » ; i2 = done ⇒ « Traitée ».
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.getByText('Traitée')).toBeInTheDocument();
  });

  // §65/§66 — la réponse de i1 (replies[]) est rendue nichée dans l'historique objet.
  it('rend les réponses nichées de l historique (fil de discussion)', async () => {
    renderView();
    await screen.findByText('Appel tarifs');
    expect(screen.getByText('Tarifs intégrés dans la fiche.')).toBeInTheDocument();
  });

  // Fix « par Système » : i2 a owner null + interlocutor_email ⇒ auteur affiché = l'interlocuteur.
  it('auteur de carte résolu sur l interlocuteur quand owner null (plus « par Système »)', async () => {
    renderView();
    await screen.findByText('Adhésion 2026');
    expect(screen.getByText('par contact@basalte.re')).toBeInTheDocument();
    expect(screen.queryByText('par Système')).not.toBeInTheDocument();
  });

  // §65/§66 — répondre dans l'historique objet : saveCrmInteraction({parentInteractionId}) + refetch.
  it('Répondre dans l historique → saveCrmInteraction({ parentInteractionId }) + refresh', async () => {
    renderView();
    const card = (await screen.findByText('Tarifs validés.')).closest('.tl-card') as HTMLElement;
    const actionsBar = card.querySelector('.tl-actions') as HTMLElement;
    fireEvent.click(within(actionsBar).getByRole('button', { name: /répondre/i }));
    const composer = card.querySelector('.tl-reply-composer') as HTMLElement;
    fireEvent.change(within(composer).getByPlaceholderText(/votre réponse/i), { target: { value: 'Suivi.' } });
    fireEvent.click(within(composer).getByRole('button', { name: /envoyer/i }));
    await waitFor(() =>
      expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith({ parentInteractionId: 'i1', body: 'Suivi.' }),
    );
    await waitFor(() => expect(crmMock.listObjectCrm).toHaveBeenCalledTimes(2));
  });

  // §66 (PO) — modifier la racine depuis l'historique objet : saveCrmInteraction({id, body, sentimentCode}).
  it('Modifier dans l historique → saveCrmInteraction({ id, body, sentimentCode }) + refresh', async () => {
    renderView();
    const card = (await screen.findByText('Tarifs validés.')).closest('.tl-card') as HTMLElement;
    const actionsBar = card.querySelector('.tl-actions') as HTMLElement;
    fireEvent.click(within(actionsBar).getByRole('button', { name: /^modifier$/i }));
    fireEvent.change(within(card).getByLabelText('Modifier le commentaire'), { target: { value: 'Tarifs revus.' } });
    fireEvent.click(within(card).getByRole('button', { name: /enregistrer/i }));
    await waitFor(() =>
      expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith({ id: 'i1', body: 'Tarifs revus.', sentimentCode: 'positif' }),
    );
    await waitFor(() => expect(crmMock.listObjectCrm).toHaveBeenCalledTimes(2));
  });

  // §66 (PO) — supprimer une RÉPONSE (i1-r1) : passe l'id de la réponse à deleteCrmInteraction.
  it('Supprimer une réponse → confirm puis deleteCrmInteraction(replyId)', async () => {
    renderView();
    const reply = (await screen.findByText('Tarifs intégrés dans la fiche.')).closest('.tl-reply') as HTMLElement;
    fireEvent.click(within(reply).getByRole('button', { name: /^supprimer$/i }));
    fireEvent.click(within(reply).getByRole('button', { name: /^oui$/i }));
    await waitFor(() => expect(crmMock.deleteCrmInteraction).toHaveBeenCalledWith('i1-r1'));
  });
});
