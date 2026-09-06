import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmTaskModal } from './CrmTaskModal';
import { toDateInputValue } from './crm-view-utils';

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

  // M4 — le pré-remplissage était `task.dueAt.slice(0, 10)`, c'est-à-dire la date UTC, alors
  // que la carte kanban rend la même valeur en heure LOCALE (`formatShort`). À UTC+4 (La
  // Réunion), une due_at entre 20:00Z et 24:00Z faisait afficher J+1 par la carte et J par le
  // modal — et enregistrer PERSISTAIT l'écart, `save_crm_task` acceptant bien des heures.
  it("échéance dans la FENÊTRE À RISQUE : le champ suit le fuseau d'affichage de la carte", async () => {
    // Témoin construit depuis le fuseau du runtime, jamais un ISO littéral : écrit en dur, il
    // ne serait discriminant que dans le fuseau où il a été écrit et passerait au vert
    // ailleurs sans rien prouver. 00:30 LOCAL le 16/09 vaut 20:30Z le 15/09 à UTC+4 — c'est
    // exactement la fenêtre où `slice(0, 10)` rendait la veille.
    const minuitTrenteLocal = new Date(2026, 8, 16, 0, 30, 0);
    renderModal({
      task: { ...taskFixture, dueAt: minuitTrenteLocal.toISOString() },
      objectOptions: [],
    });
    expect(screen.getByLabelText('Échéance')).toHaveValue(toDateInputValue(minuitTrenteLocal.toISOString()));
    expect(screen.getByLabelText('Échéance')).toHaveValue('2026-09-16');
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
    const onClose = jest.fn();
    window.confirm = jest.fn().mockReturnValue(true);
    renderModal({ task: taskWithDoc, objectOptions: [], onSaved, onClose });
    expect(screen.getByText('Devis.pdf')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer « Devis.pdf »' }));
    await waitFor(() => expect(jest.mocked(deleteTaskDocument)).toHaveBeenCalledWith({
      taskId: 't-9', documentId: 'd-1', accessToken: 'token-test',
    }));
    expect(onSaved).toHaveBeenCalled(); // invalide crm-tasks SANS fermer le modal
    // Même raison que pour l'upload : `CrmModal` ne se démonte JAMAIS de lui-même en réaction à
    // `onClose`, donc asserter la présence persistante du titre serait vacuous (le heading reste
    // là que `onClose()` soit appelé ou non). Seul le mock peut faire rougir un `onClose()` ajouté
    // par erreur sur le chemin de suppression.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('édition : suppression refusée à la confirmation → aucun appel', async () => {
    window.confirm = jest.fn().mockReturnValue(false);
    renderModal({ task: taskWithDoc, objectOptions: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer « Devis.pdf »' }));
    expect(deleteTaskDocument).not.toHaveBeenCalled();
  });

  it('édition : upload un fichier choisi', async () => {
    const onSaved = jest.fn();
    const onClose = jest.fn();
    renderModal({ task: taskWithDoc, objectOptions: [], onSaved, onClose });
    const file = new File(['x'], 'Nouveau.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Ajouter un document'), file);
    await waitFor(() => expect(jest.mocked(uploadTaskDocument)).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't-9', accessToken: 'token-test' }),
    ));
    expect(onSaved).toHaveBeenCalled();
    // Contrairement à `createMutation`, l'upload NE FERME PAS le modal (l'utilisateur doit
    // pouvoir enchaîner plusieurs pièces jointes) — un futur `onClose()` ajouté par erreur sur
    // ce seul chemin doit rougir. NB : `CrmModal` ne se démonte JAMAIS lui-même en réaction à
    // `onClose` (c'est le PARENT hors-test qui déciderait de ne plus le monter) — asserter la
    // présence persistante du titre serait donc vacuous ici (sabotage vérifié : passe au vert
    // même avec un `onClose()` ajouté). On assert directement que le mock `onClose` n'a PAS
    // été appelé, seule assertion que ce test isolé peut réellement faire rougir.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('édition : upload en échec → erreur visible (pas d’échec silencieux)', async () => {
    jest.mocked(uploadTaskDocument).mockRejectedValueOnce(new Error('Fichier trop volumineux'));
    renderModal({ task: taskWithDoc, objectOptions: [] });
    const file = new File(['x'], 'Trop-gros.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Ajouter un document'), file);
    expect(await screen.findByText('Fichier trop volumineux')).toBeInTheDocument();
  });

  // Constat de revue central : `error` d'une `useMutation` react-query n'est effacée QUE
  // quand CETTE MÊME mutation est rejouée. Un test qui n'exercerait qu'une seule mutation ne
  // peut PAS voir une bannière restée affichée à tort — il faut la SÉQUENCE : un échec d'upload
  // puis une suppression réussie, et vérifier que la bannière d'erreur a disparu.
  it('séquence upload échoué puis suppression réussie → la bannière d’erreur disparaît', async () => {
    jest.mocked(uploadTaskDocument).mockRejectedValueOnce(new Error('Fichier trop volumineux'));
    window.confirm = jest.fn().mockReturnValue(true);
    renderModal({ task: taskWithDoc, objectOptions: [] });

    const badFile = new File(['x'], 'Trop-gros.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Ajouter un document'), badFile);
    expect(await screen.findByText('Fichier trop volumineux')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer « Devis.pdf »' }));
    await waitFor(() => expect(jest.mocked(deleteTaskDocument)).toHaveBeenCalled());

    expect(screen.queryByText('Fichier trop volumineux')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

  // Frontière exacte que la spec nomme (« jamais 0 Ko ») : `0` est une taille CONNUE et
  // valide, distincte de `null` (« taille inconnue »). `formatDocumentSize` teste
  // `value === null` AVANT `value < 1024` — si l'ordre s'inversait, `0` tomberait dans la
  // branche `null` (0 est faux comme condition, mais `0 < 1024` est vrai AVANT le check
  // null si celui-ci passe après) et devrait rendre « 0 o », pas « taille inconnue ».
  it('sizeBytes: 0 affiche « 0 o », jamais « taille inconnue »', () => {
    const taskWithZeroSize = {
      ...taskFixture,
      documents: [{ id: 'd-4', title: 'Vide.pdf', mimeType: 'application/pdf', sizeBytes: 0, createdAt: null }],
    };
    renderModal({ task: taskWithZeroSize, objectOptions: [] });
    expect(screen.getByText('0 o')).toBeInTheDocument();
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
