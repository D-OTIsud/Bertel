import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmInteractionModal } from './CrmInteractionModal';
import * as crm from '../../services/crm';

jest.mock('../../services/crm');

const crmMock = crm as jest.Mocked<typeof crm>;

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
    fireEvent.change(screen.getByLabelText('Contexte'), { target: { value: 'o2' } });
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

describe('CrmInteractionModal — tâche de suivi liée (§66 décision 1)', () => {
  it('case « Créer une tâche de suivi liée » révèle titre / échéance / Attribuer à', async () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    fireEvent.click(screen.getByLabelText(/créer une tâche de suivi/i));
    expect(screen.getByLabelText('Titre de la tâche')).toBeInTheDocument();
    expect(screen.getByLabelText('Échéance')).toBeInTheDocument();
    await screen.findByLabelText('Attribuer à');
  });

  it('titre de tâche pré-rempli depuis le sujet sélectionné (éditable)', () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    fireEvent.change(screen.getByLabelText('Sujet normalisé'), { target: { value: 'demande_de_visite' } });
    fireEvent.click(screen.getByLabelText(/créer une tâche de suivi/i));
    expect((screen.getByLabelText('Titre de la tâche') as HTMLInputElement).value).toBe('Demande de visite');
  });

  it('soumission séquentielle : saveCrmInteraction PUIS saveCrmTask avec relatedInteractionId = id renvoyé', async () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' }, actorOptions: [{ actorId: 'a1', displayName: 'Mme Hoarau' }] });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel' } });
    fireEvent.change(screen.getByLabelText('Acteur'), { target: { value: 'a1' } });
    fireEvent.click(screen.getByLabelText(/créer une tâche de suivi/i));
    await screen.findByLabelText('Attribuer à');
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Rappeler le directeur' } });
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-06-20' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));

    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalled());
    expect(crmMock.saveCrmInteraction).toHaveBeenCalledTimes(1);
    // saveCrmTask reçoit l'objet de l'interaction + l'acteur ancré + le lien = id renvoyé.
    expect(crmMock.saveCrmTask).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: 'o1',
        actorId: 'a1',
        title: 'Rappeler le directeur',
        dueAt: '2026-06-20',
        owner: 'usr-local-marie',
        relatedInteractionId: 'int-new',
      }),
    );
    // L'interaction est créée AVANT la tâche.
    const interactionOrder = crmMock.saveCrmInteraction.mock.invocationCallOrder[0];
    const taskOrder = crmMock.saveCrmTask.mock.invocationCallOrder[0];
    expect(interactionOrder).toBeLessThan(taskOrder);
  });

  it('case cochée mais titre vide : Consigner bloqué avec raison visible', () => {
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel' } });
    fireEvent.click(screen.getByLabelText(/créer une tâche de suivi/i));
    // Titre vidé (le sujet n'est pas choisi → pré-remplissage par défaut éditable ; on le vide).
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /consigner/i })).toBeDisabled();
    expect(screen.getByText(/Renseignez un titre de tâche/i)).toBeInTheDocument();
  });

  it('case décochée : aucune tâche créée (seule l interaction)', async () => {
    const props = renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    expect(crmMock.saveCrmTask).not.toHaveBeenCalled();
  });

  // Échec partiel : interaction OK, tâche KO. Le retry NE RE-CRÉE PAS l'interaction (ref idempotente).
  it('échec partiel (tâche KO) : retry ne re-crée pas l interaction, ne rejoue que la tâche', async () => {
    crmMock.saveCrmTask.mockRejectedValueOnce(new Error('refus tâche')).mockResolvedValueOnce('task-new');
    renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel' } });
    fireEvent.click(screen.getByLabelText(/créer une tâche de suivi/i));
    await screen.findByLabelText('Attribuer à');
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Suivi' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));

    // 1er essai : interaction créée, tâche en échec → erreur visible, modal ouvert.
    expect(await screen.findByText(/refus tâche/i)).toBeInTheDocument();
    expect(crmMock.saveCrmInteraction).toHaveBeenCalledTimes(1);

    // Retry : la tâche est rejouée, l'interaction n'est PAS re-créée.
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledTimes(2));
    expect(crmMock.saveCrmInteraction).toHaveBeenCalledTimes(1);
  });

  it('succès avec tâche : onSaved puis onClose appelés', async () => {
    const props = renderModal({ fixedContext: { objectId: 'o1', objectName: 'Hôtel A' } });
    fireEvent.change(screen.getByPlaceholderText(/consigner une interaction/i), { target: { value: 'Appel' } });
    fireEvent.click(screen.getByLabelText(/créer une tâche de suivi/i));
    await screen.findByLabelText('Attribuer à');
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Suivi' } });
    fireEvent.click(screen.getByRole('button', { name: /consigner/i }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    expect(props.onClose).toHaveBeenCalled();
  });
});
