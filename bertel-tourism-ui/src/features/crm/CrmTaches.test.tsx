import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmTaches } from './CrmTaches';
import * as crm from '../../services/crm';
import { mockCrmDirectory } from '../../data/mock';
import type { CrmTask } from '../../types/domain';

jest.mock('../../services/crm');

const crmMock = crm as jest.Mocked<typeof crm>;

const DAY_MS = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString();

// Kanban (rectif PO point 1) : une tâche par statut + une todo en retard.
const tasks: CrmTask[] = [
  { id: 'task-late', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', actorId: 'actor-1', actorName: 'Mme Marie Hoarau', title: 'Rappeler le directeur', description: 'Point médiation', status: 'todo', priority: 'high', dueAt: iso(-2), ownerName: 'Marie', relatedInteractionSubject: null },
  { id: 'task-doing', objectId: 'obj-2', objectName: 'Le Comptoir des Epices', actorId: null, actorName: null, title: 'Valider le contrat photo', description: null, status: 'in_progress', priority: 'medium', dueAt: iso(0), ownerName: 'Jean', relatedInteractionSubject: null },
  { id: 'task-done', objectId: 'obj-3', objectName: 'Sentier des Trois Cascades', actorId: null, actorName: null, title: 'Confirmer les horaires', description: null, status: 'done', priority: 'low', dueAt: iso(3), ownerName: 'Marie', relatedInteractionSubject: null },
  { id: 'task-later', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', actorId: null, actorName: null, title: 'Préparer la convention', description: null, status: 'todo', priority: 'low', dueAt: null, ownerName: 'Luc', relatedInteractionSubject: null },
];

function renderTaches(overrides: Partial<Parameters<typeof CrmTaches>[0]> = {}) {
  const props = { canWrite: true, onOpenObject: jest.fn(), onOpenActor: jest.fn(), ...overrides };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CrmTaches {...props} />
    </QueryClientProvider>,
  );
  return props;
}

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listCrmTasks.mockResolvedValue(tasks);
  crmMock.listCrmDirectory.mockResolvedValue(mockCrmDirectory);
  crmMock.saveCrmTask.mockResolvedValue('task-1');
  // Assignation (PO point 4) : le 1er = utilisateur courant démo (usr-local-marie).
  crmMock.listCrmAssignees.mockResolvedValue([
    { userId: 'usr-local-marie', displayName: 'Marie D.' },
    { userId: 'usr-local-jean', displayName: 'Jean P.' },
  ]);
});

describe('CrmTaches (§61 — kanban Tâches & relances)', () => {
  it('répartit les tâches en 3 colonnes par statut réel (À faire / En cours / Terminées)', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    const todo = screen.getByRole('region', { name: 'À faire' });
    expect(within(todo).getByText('Rappeler le directeur')).toBeInTheDocument();
    expect(within(todo).getByText('Préparer la convention')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'En cours' })).getByText('Valider le contrat photo')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Terminées' })).getByText('Confirmer les horaires')).toBeInTheDocument();
  });

  // Assertion verrouillée par revue : un move kanban PERSISTE via saveCrmTask.
  it('Avancer : todo → in_progress puis in_progress → done via saveCrmTask', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: 'Avancer « Rappeler le directeur »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-late', status: 'in_progress' }));
    fireEvent.click(screen.getByRole('button', { name: 'Avancer « Valider le contrat photo »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-doing', status: 'done' }));
  });

  it('Reprendre (in_progress → todo) et Rouvrir (done → todo)', async () => {
    renderTaches();
    await screen.findByText('Valider le contrat photo');
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre « Valider le contrat photo »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-doing', status: 'todo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rouvrir « Confirmer les horaires »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-done', status: 'todo' }));
  });

  it('badge d échéance DANS la carte : late (rouge) sur la tâche en retard, today sur celle du jour', async () => {
    renderTaches();
    const lateCard = (await screen.findByText('Rappeler le directeur')).closest('.ticket');
    expect(lateCard?.querySelector('.due.late')).toBeTruthy();
    const todayCard = screen.getByText('Valider le contrat photo').closest('.ticket');
    expect(todayCard?.querySelector('.due.today')).toBeTruthy();
    // Une tâche done ne porte jamais de badge d'alerte.
    const doneCard = screen.getByText('Confirmer les horaires').closest('.ticket');
    expect(doneCard?.querySelector('.due.late, .due.today')).toBeFalsy();
    expect(doneCard).toHaveClass('is-done');
  });

  it('filtre Seg par agent (ownerName distincts + « Toutes »)', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: 'Marie' }));
    expect(screen.getByText('Rappeler le directeur')).toBeInTheDocument();
    expect(screen.queryByText('Valider le contrat photo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Toutes' }));
    expect(screen.getByText('Valider le contrat photo')).toBeInTheDocument();
  });

  it('clic sur l établissement d une carte → onOpenObject(objectId)', async () => {
    const props = renderTaches();
    await screen.findByText('Valider le contrat photo');
    fireEvent.click(screen.getByRole('button', { name: 'Le Comptoir des Epices' }));
    expect(props.onOpenObject).toHaveBeenCalledWith('obj-2');
  });

  it('clic sur l acteur d une carte → onOpenActor(actorId) (rattachement acteur)', async () => {
    const props = renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: 'Mme Marie Hoarau' }));
    expect(props.onOpenActor).toHaveBeenCalledWith('actor-1');
  });

  it('crée une tâche : titre + établissement résolu par nom (datalist annuaire) + échéance + owner', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle tâche/i }));
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Relancer les photos' } });
    fireEvent.change(screen.getByLabelText('Établissement'), { target: { value: 'Hotel Basalte & Lagon' } });
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-06-20' } });
    // Attendre le chargement des assignables (le owner par défaut en dépend).
    await screen.findByLabelText('Attribuer à');
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      // Assignation PO point 4 : owner par défaut = utilisateur courant (usr-local-marie).
      expect(crmMock.saveCrmTask).toHaveBeenCalledWith({
        objectId: 'obj-1',
        title: 'Relancer les photos',
        dueAt: '2026-06-20',
        owner: 'usr-local-marie',
      }),
    );
  });

  // Assignation PO point 4 : le sélecteur « Attribuer à » est présent et change le owner.
  it('onglet Tâches : « Attribuer à » change le owner envoyé', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle tâche/i }));
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Relancer' } });
    fireEvent.change(screen.getByLabelText('Établissement'), { target: { value: 'Hotel Basalte & Lagon' } });
    // Le select n'apparaît qu'une fois la liste des assignables chargée (async).
    fireEvent.change(await screen.findByLabelText('Attribuer à'), { target: { value: 'usr-local-jean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(crmMock.saveCrmTask).toHaveBeenCalledWith(expect.objectContaining({ owner: 'usr-local-jean' })),
    );
  });

  it('établissement non résolu : création bloquée avec raison visible', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle tâche/i }));
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Tâche orpheline' } });
    fireEvent.change(screen.getByLabelText('Établissement'), { target: { value: 'Inconnu au bataillon' } });
    expect(screen.getByRole('button', { name: 'Créer' })).toBeDisabled();
    expect(screen.getByText(/introuvable dans l.annuaire/i)).toBeInTheDocument();
  });

  // Assertion verrouillée par revue : un échec d'écriture est VISIBLE.
  it('échec de déplacement → erreur visible (pas d échec silencieux)', async () => {
    crmMock.saveCrmTask.mockRejectedValue(new Error('refus RLS'));
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: 'Avancer « Rappeler le directeur »' }));
    expect(await screen.findByText(/refus RLS/)).toBeInTheDocument();
  });

  // Assertion verrouillée par revue : gating lecture seule (no-write-trap).
  it('sans permission : boutons de move et création désactivés avec raison', async () => {
    renderTaches({ canWrite: false });
    await screen.findByText('Rappeler le directeur');
    expect(screen.getByRole('button', { name: 'Avancer « Rappeler le directeur »' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rouvrir « Confirmer les horaires »' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /nouvelle tâche/i })).toBeDisabled();
    expect(screen.getAllByText(/lecture seule/i).length).toBeGreaterThan(0);
  });

  it('chip « N annulée(s)/bloquée(s) » conservé pour les statuts hors colonnes', async () => {
    crmMock.listCrmTasks.mockResolvedValue([
      ...tasks,
      { id: 'task-x', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', actorId: null, actorName: null, title: 'Tâche annulée', description: null, status: 'canceled', priority: 'low', dueAt: null, ownerName: null, relatedInteractionSubject: null },
    ]);
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    expect(screen.getByText('1 annulée(s)/bloquée(s)')).toBeInTheDocument();
    expect(screen.queryByText('Tâche annulée')).not.toBeInTheDocument();
  });
});
