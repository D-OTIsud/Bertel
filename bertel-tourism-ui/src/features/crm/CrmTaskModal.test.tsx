import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmTaskModal } from './CrmTaskModal';

jest.mock('../../services/crm', () => ({
  listCrmAssignees: jest.fn().mockResolvedValue([
    { userId: 'u-moi', displayName: 'Moi Même' },
    { userId: 'u-col', displayName: 'Collègue Un' },
  ]),
  saveCrmTask: jest.fn().mockResolvedValue('t-1'),
}));
jest.mock('../../store/session-store', () => ({
  useSessionStore: (selector: (s: { userId: string; demoMode: boolean }) => unknown) =>
    selector({ userId: 'u-moi', demoMode: false }),
}));

import { saveCrmTask } from '../../services/crm';
const mockedSave = jest.mocked(saveCrmTask);

function renderModal(props: Partial<React.ComponentProps<typeof CrmTaskModal>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CrmTaskModal
        picker="select"
        objectOptions={[{ objectId: 'OBJ1', objectName: 'Hôtel Test' }]}
        onClose={jest.fn()}
        onSaved={jest.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('CrmTaskModal — description', () => {
  beforeEach(() => mockedSave.mockClear());

  it('envoie la description saisie à la création', async () => {
    renderModal();
    await userEvent.type(screen.getByLabelText('Titre de la tâche'), 'Rappeler le client');
    await userEvent.type(screen.getByLabelText('Description de la tâche'), 'Voir le devis n°42');
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    expect(mockedSave.mock.calls[0][0]).toMatchObject({ description: 'Voir le devis n°42' });
  });

  it("n'envoie PAS la clé description quand le champ est vide (création)", async () => {
    renderModal();
    await userEvent.type(screen.getByLabelText('Titre de la tâche'), 'Sans description');
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    expect(mockedSave.mock.calls[0][0]).not.toHaveProperty('description');
  });
});

// Task 3 — mode ÉDITION : `task` pré-remplit le formulaire, verrouille l'établissement,
// et soumet un update partiel par id (description TOUJOURS envoyée, y compris vidée).
const taskFixture = {
  id: 't-9', objectId: 'OBJ1', objectName: 'Hôtel Test',
  actorId: null, actorName: null,
  title: 'Titre initial', description: 'Description initiale',
  status: 'todo' as const, priority: 'medium' as const,
  dueAt: '2026-09-15T00:00:00+00:00', createdAt: '2026-08-01T00:00:00+00:00',
  assignees: [{ userId: 'u-col', displayName: 'Collègue Un' }],
  createdById: 'u-moi', createdByName: 'Moi Même',
  ownerId: null, ownerName: null,
  relatedInteractionId: null, relatedInteractionSubject: null, relatedInteractionStatus: null,
  documents: [],
};

describe('CrmTaskModal — édition', () => {
  beforeEach(() => mockedSave.mockClear());

  it('pré-remplit titre, description, échéance, assignés ; établissement en lecture seule', async () => {
    renderModal({ task: taskFixture, objectOptions: [] });
    expect(screen.getByLabelText('Titre de la tâche')).toHaveValue('Titre initial');
    expect(screen.getByLabelText('Description de la tâche')).toHaveValue('Description initiale');
    expect(screen.getByLabelText('Échéance')).toHaveValue('2026-09-15');
    expect(screen.getByText('Hôtel Test')).toBeInTheDocument(); // static, pas un picker
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
  });

  it("soumet id + description (y compris vidée → '')", async () => {
    renderModal({ task: taskFixture, objectOptions: [] });
    await userEvent.clear(screen.getByLabelText('Description de la tâche'));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    expect(mockedSave.mock.calls[0][0]).toMatchObject({
      id: 't-9', title: 'Titre initial', description: '', assigneeIds: ['u-col'],
    });
    expect(mockedSave.mock.calls[0][0]).not.toHaveProperty('objectId'); // jamais de déplacement
  });
});
