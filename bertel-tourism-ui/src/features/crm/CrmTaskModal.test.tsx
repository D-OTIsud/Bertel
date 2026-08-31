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
jest.mock('../../services/task-documents', () => ({
  uploadTaskDocument: jest.fn().mockResolvedValue({ documentId: 'd-2', title: 'Nouveau.pdf' }),
  getTaskDocumentUrl: jest.fn().mockResolvedValue('https://signed.example/x'),
  deleteTaskDocument: jest.fn().mockResolvedValue(undefined),
}));
// Le jeton par défaut ('token-test') couvre la majorité des scénarios ; `mockAccessToken`
// (préfixe requis par le hoisting de jest.mock) reste overridable via mockReturnValueOnce
// pour le cas « jeton pas encore lu » (accessToken === null → boutons désactivés).
const mockAccessToken = jest.fn((): string | null => 'token-test');
jest.mock('../../hooks/useSupabaseAccessToken', () => ({
  useSupabaseAccessToken: () => mockAccessToken(),
}));

import { saveCrmTask } from '../../services/crm';
import { deleteTaskDocument, getTaskDocumentUrl, uploadTaskDocument } from '../../services/task-documents';
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

// Task 9 — section « Pièces jointes » : SEULEMENT en édition (une tâche en création n'a pas
// encore d'id auquel ancrer un fichier). Les trois mutations (upload/ouvrir/supprimer)
// appellent onSaved() qui invalide `crm-tasks` SANS fermer le modal — l'utilisateur peut
// enchaîner plusieurs pièces jointes.
describe('CrmTaskModal — pièces jointes', () => {
  const taskWithDoc = {
    ...taskFixture,
    documents: [{ id: 'd-1', title: 'Devis.pdf', mimeType: 'application/pdf', sizeBytes: 1234, createdAt: null }],
  };

  beforeEach(() => {
    mockAccessToken.mockReturnValue('token-test');
    jest.mocked(uploadTaskDocument).mockClear();
    jest.mocked(deleteTaskDocument).mockClear();
    jest.mocked(getTaskDocumentUrl).mockClear();
  });

  it('création : pas de section documents, un mot l’explique', () => {
    renderModal();
    expect(screen.queryByText('Pièces jointes')).not.toBeInTheDocument();
    expect(screen.getByText('Enregistrez la tâche pour joindre des documents.')).toBeInTheDocument();
  });

  it('édition : aucune pièce jointe → message dédié dans la liste', () => {
    renderModal({ task: taskFixture, objectOptions: [] }); // taskFixture.documents = []
    expect(screen.getByText('Pièces jointes')).toBeInTheDocument();
    expect(screen.getByText('Aucune pièce jointe.')).toBeInTheDocument();
  });

  it('édition : liste les documents et supprime avec confirmation', async () => {
    const onSaved = jest.fn();
    window.confirm = jest.fn().mockReturnValue(true);
    renderModal({ task: taskWithDoc, objectOptions: [], onSaved });
    expect(screen.getByText('Devis.pdf')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer « Devis.pdf »' }));
    await waitFor(() => expect(jest.mocked(deleteTaskDocument)).toHaveBeenCalledWith({
      taskId: 't-9', documentId: 'd-1', accessToken: 'token-test',
    }));
    expect(onSaved).toHaveBeenCalled(); // invalide crm-tasks SANS fermer le modal
    expect(screen.getByRole('heading', { name: 'Modifier la tâche' })).toBeInTheDocument();
  });

  it('édition : suppression refusée à la confirmation → aucun appel', async () => {
    window.confirm = jest.fn().mockReturnValue(false);
    renderModal({ task: taskWithDoc, objectOptions: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer « Devis.pdf »' }));
    expect(deleteTaskDocument).not.toHaveBeenCalled();
  });

  it('édition : upload un fichier choisi', async () => {
    const onSaved = jest.fn();
    renderModal({ task: taskWithDoc, objectOptions: [], onSaved });
    const file = new File(['x'], 'Nouveau.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Ajouter un document'), file);
    await waitFor(() => expect(jest.mocked(uploadTaskDocument)).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't-9', accessToken: 'token-test' }),
    ));
    expect(onSaved).toHaveBeenCalled();
  });

  it('édition : upload en échec → erreur visible (pas d’échec silencieux)', async () => {
    jest.mocked(uploadTaskDocument).mockRejectedValueOnce(new Error('Fichier trop volumineux'));
    renderModal({ task: taskWithDoc, objectOptions: [] });
    const file = new File(['x'], 'Trop-gros.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Ajouter un document'), file);
    expect(await screen.findByText('Fichier trop volumineux')).toBeInTheDocument();
  });

  it('édition : Ouvrir demande l’URL signée et ouvre un nouvel onglet', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    renderModal({ task: taskWithDoc, objectOptions: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir « Devis.pdf »' }));
    await waitFor(() => expect(getTaskDocumentUrl).toHaveBeenCalledWith({
      taskId: 't-9', documentId: 'd-1', accessToken: 'token-test',
    }));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://signed.example/x', '_blank', 'noopener'));
    openSpy.mockRestore();
  });

  // Résolution controleur — sizeBytes: null est une garde SQL délibérée (taille illisible),
  // à ne JAMAIS confondre avec une taille de 0 octet : les deux doivent rester distinguables.
  it('sizeBytes null affiche « taille inconnue », jamais « 0 Ko »', () => {
    const taskWithUnknownSize = {
      ...taskFixture,
      documents: [{ id: 'd-3', title: 'Sans-taille.pdf', mimeType: 'application/pdf', sizeBytes: null, createdAt: null }],
    };
    renderModal({ task: taskWithUnknownSize, objectOptions: [] });
    expect(screen.getByText('taille inconnue')).toBeInTheDocument();
    expect(screen.queryByText('0 Ko')).not.toBeInTheDocument();
  });

  it('sizeBytes: 1234 → arrondi en Ko, distinct de « taille inconnue »', () => {
    renderModal({ task: taskWithDoc, objectOptions: [] });
    expect(screen.getByText('1 Ko')).toBeInTheDocument();
    expect(screen.queryByText('taille inconnue')).not.toBeInTheDocument();
  });

  // Jeton pas encore lu (accessToken === null) : les boutons restent désactivés — sinon
  // l'appel partirait sans Authorization et la route répondrait 401 sans que l'utilisateur
  // comprenne pourquoi.
  it('jeton non encore lu : Ouvrir/Supprimer/Ajouter restent désactivés', () => {
    mockAccessToken.mockReturnValue(null);
    renderModal({ task: taskWithDoc, objectOptions: [] });
    expect(screen.getByRole('button', { name: 'Ouvrir « Devis.pdf »' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Supprimer « Devis.pdf »' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ajouter un document' })).toBeDisabled();
  });
});
