import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmInteractionModal } from './CrmInteractionModal';
import * as crm from '../../services/crm';
import { pickerListbox } from '../../components/ui/pickers/pickers.test-utils';

jest.mock('../../services/crm');

const crmMock = crm as jest.Mocked<typeof crm>;

// Les champs longs (sujet/établissement/acteur) sont des SearchSelect (combobox + popover),
// plus des <select> natifs : on ouvre puis on clique l'option.
function pickFromCombobox(name: string | RegExp, optionName: string | RegExp) {
  fireEvent.click(screen.getByRole('combobox', { name }));
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}

const topics = [
  { code: 'demande_de_visite', name: 'Demande de visite' },
  { code: 'modification_infos_bdd', name: 'Modification infos BDD' },
];

function renderModal(props: Partial<Parameters<typeof CrmInteractionModal>[0]> = {}) {
  const merged = { topics, onClose: jest.fn(), onSaved: jest.fn(), ...props };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CrmInteractionModal {...merged} />
    </QueryClientProvider>,
  );
  return merged;
}

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.saveCrmInteraction.mockResolvedValue('int-new');
  crmMock.saveCrmTask.mockResolvedValue('task-new');
  crmMock.listCrmAssignees.mockResolvedValue([
    { userId: 'usr-local-marie', displayName: 'Marie D.' },
    { userId: 'usr-local-jean', displayName: 'Jean P.' },
  ]);
});

describe('CrmInteractionModal — établissement requis (§66 décision 1)', () => {
  it('fiche : pas d option « Contexte : général » dans le select', () => {
    renderModal({
      actorId: 'a1',
      contexts: [
        { objectId: 'o1', objectName: 'Hôtel A' },
        { objectId: 'o2', objectName: 'Restaurant B' },
      ],
    });
    expect(screen.queryByRole('option', { name: /général/i })).not.toBeInTheDocument();
  });

  it('fiche, >1 établissement : aucun choisi ⇒ Consigner bloqué même avec un corps', () => {
    renderModal({
      actorId: 'a1',
      contexts: [
        { objectId: 'o1', objectName: 'Hôtel A' },
        { objectId: 'o2', objectName: 'Restaurant B' },
      ],
    });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel passé' } });
    expect(screen.getByRole('button', { name: /consigner/i })).toBeDisabled();
    // Choisir un établissement débloque.
    pickFromCombobox('Contexte', 'Restaurant B');
    expect(screen.getByRole('button', { name: /consigner/i })).toBeEnabled();
  });

  it('fiche, 1 seul établissement : pré-sélectionné ⇒ Consigner actif dès la saisie du corps', () => {
    renderModal({ actorId: 'a1', contexts: [{ objectId: 'o1', objectName: 'Hôtel A' }] });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel passé' } });
    expect(screen.getByRole('button', { name: /consigner/i })).toBeEnabled();
  });

  it('vue établissement (fixedContext) : objet imposé, Consigner actif dès la saisie', () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Visite' } });
    expect(screen.getByRole('button', { name: /consigner/i })).toBeEnabled();
  });

  it('consigne avec l objectId choisi (fiche)', async () => {
    renderModal({ actorId: 'a1', contexts: [{ objectId: 'o1', objectName: 'Hôtel A' }] });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel passé' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    await waitFor(() =>
      expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'a1', objectId: 'o1' })),
    );
  });
});

describe('CrmInteractionModal — relance en 2 temps (Phase 5.2, dé-modalisation)', () => {
  // Plus de formulaire-dans-formulaire : aucun champ de relance avant d'avoir consigné.
  it('pas de champ de relance avant consignation (plus de formulaire imbriqué)', () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    expect(screen.queryByLabelText('Titre de la tâche')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ajouter une relance/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/créer une tâche de suivi/i)).not.toBeInTheDocument();
  });

  it('après consignation : confirmation + « Ajouter une relance » révèle titre / échéance / Attribuer à', async () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    expect(await screen.findByText(/interaction enregistrée/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ajouter une relance/i }));
    expect(screen.getByLabelText('Titre de la tâche')).toBeInTheDocument();
    expect(screen.getByLabelText('Échéance')).toBeInTheDocument();
    await screen.findByLabelText('Attribuer à');
  });

  it('titre de relance pré-rempli depuis le sujet sélectionné (éditable)', async () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    pickFromCombobox('Sujet normalisé', 'Demande de visite');
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    fireEvent.click(await screen.findByRole('button', { name: /ajouter une relance/i }));
    expect((screen.getByLabelText('Titre de la tâche') as HTMLInputElement).value).toBe('Demande de visite');
  });

  it('flux séquentiel : Consigner (saveCrmInteraction) PUIS relance (saveCrmTask, relatedInteractionId = id renvoyé)', async () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' }, actorOptions: [{ actorId: 'a1', displayName: 'Mme Hoarau' }] });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel' } });
    pickFromCombobox('Acteur', 'Mme Hoarau');
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    await waitFor(() => expect(crmMock.saveCrmInteraction).toHaveBeenCalledTimes(1));
    // À ce stade, AUCUNE tâche : la relance est une étape distincte, après coup.
    expect(crmMock.saveCrmTask).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: /ajouter une relance/i }));
    await screen.findByLabelText('Attribuer à');
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Rappeler le directeur' } });
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-06-20' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer la relance/i }));

    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalled());
    expect(crmMock.saveCrmInteraction).toHaveBeenCalledTimes(1);
    expect(crmMock.saveCrmTask).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: 'o1',
        actorId: 'a1',
        title: 'Rappeler le directeur',
        dueAt: '2026-06-20',
        // 16w — la relance part avec le TABLEAU des assignés (défaut : l'utilisateur
        // courant), en même temps que son lien vers l'interaction consignée.
        assigneeIds: ['usr-local-marie'],
        relatedInteractionId: 'int-new',
      }),
    );
    const interactionOrder = crmMock.saveCrmInteraction.mock.invocationCallOrder[0];
    const taskOrder = crmMock.saveCrmTask.mock.invocationCallOrder[0];
    expect(interactionOrder).toBeLessThan(taskOrder);
  });

  // 16w — la voie « relance » accepte PLUSIEURS personnes, comme la voie « Nouvelle tâche ».
  it('relance : plusieurs assignés partent avec le lien vers l’interaction', async () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    fireEvent.click(await screen.findByRole('button', { name: /ajouter une relance/i }));
    const trigger = await screen.findByRole('combobox', { name: 'Attribuer à' });
    await waitFor(() => expect(trigger).toHaveTextContent('Marie D.'));
    fireEvent.click(trigger);
    fireEvent.click(pickerListbox(trigger).getByRole('option', { name: 'Jean P.' }));
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Suivi' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer la relance/i }));
    await waitFor(() =>
      expect(crmMock.saveCrmTask).toHaveBeenCalledWith(
        expect.objectContaining({
          assigneeIds: ['usr-local-marie', 'usr-local-jean'],
          relatedInteractionId: 'int-new',
        }),
      ),
    );
  });

  it('relance : aucun assigné ⇒ enregistrement bloqué avec raison visible', async () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    fireEvent.click(await screen.findByRole('button', { name: /ajouter une relance/i }));
    const trigger = await screen.findByRole('combobox', { name: 'Attribuer à' });
    await waitFor(() => expect(trigger).toHaveTextContent('Marie D.'));
    fireEvent.click(trigger);
    fireEvent.click(pickerListbox(trigger).getByRole('option', { name: 'Marie D.' }));
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Suivi' } });
    expect(screen.getByRole('button', { name: /enregistrer la relance/i })).toBeDisabled();
    expect(screen.getByText('Choisissez au moins une personne.')).toBeInTheDocument();
  });

  it('relance : titre vidé ⇒ « Enregistrer la relance » bloqué avec raison visible', async () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    fireEvent.click(await screen.findByRole('button', { name: /ajouter une relance/i }));
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /enregistrer la relance/i })).toBeDisabled();
    expect(screen.getByText(/Renseignez un titre de tâche/i)).toBeInTheDocument();
  });

  it('Consigner sans relance : onSaved appelé, aucune tâche créée', async () => {
    const props = renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    expect(crmMock.saveCrmTask).not.toHaveBeenCalled();
  });

  // Mutations SÉPARÉES : un échec de relance ne re-crée jamais l'interaction (retry = tâche seule).
  it('échec de relance : retry ne re-crée pas l interaction, ne rejoue que la tâche', async () => {
    crmMock.saveCrmTask.mockRejectedValueOnce(new Error('refus tâche')).mockResolvedValueOnce('task-new');
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    fireEvent.click(await screen.findByRole('button', { name: /ajouter une relance/i }));
    await screen.findByLabelText('Attribuer à');
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Suivi' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer la relance/i }));

    expect(await screen.findByText(/refus tâche/i)).toBeInTheDocument();
    expect(crmMock.saveCrmInteraction).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /enregistrer la relance/i }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledTimes(2));
    expect(crmMock.saveCrmInteraction).toHaveBeenCalledTimes(1);
  });

  it('succès avec relance : onSaved puis onClose appelés', async () => {
    const props = renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    fireEvent.click(await screen.findByRole('button', { name: /ajouter une relance/i }));
    await screen.findByLabelText('Attribuer à');
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Suivi' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer la relance/i }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(props.onSaved).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------
// Chantier 2026-08-28 n°5 — SUITE À DONNER. La modale n'envoyait aucun `status` et le serveur
// retombait sur « traitée » : toute demande naissait close, invisible du filtre « Actives ».
// Le PO a tranché pour un choix EXPLICITE, dont la position initiale est dérivée du sujet.
// ---------------------------------------------------------------------------------------
describe('CrmInteractionModal — suite à donner (chantier 2026-08-28)', () => {
  it('sans sujet : la position initiale est « Déjà traitée » et le payload porte status=resolved', async () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });

    expect(screen.getByRole('button', { name: /déjà traitée/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /à traiter/i })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Compte rendu' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));

    await waitFor(() => expect(crmMock.saveCrmInteraction).toHaveBeenCalledTimes(1));
    expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith(expect.objectContaining({ status: 'resolved' }));
  });

  it('un sujet choisi bascule la position initiale sur « À traiter » et envoie status=new', async () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });

    pickFromCombobox('Sujet normalisé', 'Demande de visite');
    expect(screen.getByRole('button', { name: /à traiter/i })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Demande reçue' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));

    await waitFor(() => expect(crmMock.saveCrmInteraction).toHaveBeenCalledTimes(1));
    expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith(expect.objectContaining({ status: 'new' }));
  });

  it('le choix de l’agent PRIME et ne rebascule pas quand le sujet change ensuite', async () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });

    // L'agent force « À traiter » AVANT de choisir un sujet…
    fireEvent.click(screen.getByRole('button', { name: /à traiter/i }));
    expect(screen.getByRole('button', { name: /à traiter/i })).toHaveAttribute('aria-pressed', 'true');

    // …puis choisit un sujet, ce qui ne doit RIEN changer (le dérivé ne reprend jamais la main).
    pickFromCombobox('Sujet normalisé', 'Demande de visite');
    expect(screen.getByRole('button', { name: /à traiter/i })).toHaveAttribute('aria-pressed', 'true');

    // Et l'inverse : forcer « Déjà traitée » sur une interaction AVEC sujet doit tenir.
    fireEvent.click(screen.getByRole('button', { name: /déjà traitée/i }));
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Réglé au téléphone' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));

    await waitFor(() => expect(crmMock.saveCrmInteraction).toHaveBeenCalledTimes(1));
    expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'resolved', topicCode: 'demande_de_visite' }),
    );
  });
});
