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
