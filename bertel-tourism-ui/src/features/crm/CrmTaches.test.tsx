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

const tasks: CrmTask[] = [
  { id: 'task-late', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', actorId: 'actor-1', actorName: 'Mme Marie Hoarau', title: 'Rappeler le directeur', description: 'Point médiation', status: 'todo', priority: 'high', dueAt: iso(-2), ownerName: 'Marie', relatedInteractionSubject: null },
  { id: 'task-today', objectId: 'obj-2', objectName: 'Le Comptoir des Epices', actorId: null, actorName: null, title: 'Valider le contrat photo', description: null, status: 'todo', priority: 'medium', dueAt: iso(0), ownerName: 'Jean', relatedInteractionSubject: null },
  { id: 'task-week', objectId: 'obj-3', objectName: 'Sentier des Trois Cascades', actorId: null, actorName: null, title: 'Confirmer les horaires', description: null, status: 'done', priority: 'low', dueAt: iso(3), ownerName: 'Marie', relatedInteractionSubject: null },
  { id: 'task-later', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', actorId: null, actorName: null, title: 'Préparer la convention', description: null, status: 'todo', priority: 'low', dueAt: null, ownerName: 'Luc', relatedInteractionSubject: null },
];

function renderTaches(overrides: Partial<Parameters<typeof CrmTaches>[0]> = {}) {
  const props = { canWrite: true, onOpenObject: jest.fn(), ...overrides };
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
});

describe('CrmTaches (§61 — tâches & relances)', () => {
  it('groupe les tâches par échéance réelle (En retard / Aujourd hui / Cette semaine / Plus tard)', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    expect(within(screen.getByRole('region', { name: 'En retard' })).getByText('Rappeler le directeur')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: "Aujourd'hui" })).getByText('Valider le contrat photo')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Cette semaine' })).getByText('Confirmer les horaires')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Plus tard' })).getByText('Préparer la convention')).toBeInTheDocument();
  });

  it('coche une tâche → saveCrmTask(done) ; décoche une tâche faite → saveCrmTask(todo)', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: 'Basculer la tâche « Rappeler le directeur »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-late', status: 'done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Basculer la tâche « Confirmer les horaires »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-week', status: 'todo' }));
  });

  it('une tâche faite est barrée (.is-done)', async () => {
    renderTaches();
    const title = await screen.findByText('Confirmer les horaires');
    expect(title.closest('.task-row')).toHaveClass('is-done');
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

  it('clic sur l établissement d une tâche → onOpenObject(objectId)', async () => {
    const props = renderTaches();
    await screen.findByText('Valider le contrat photo');
    fireEvent.click(screen.getByRole('button', { name: 'Le Comptoir des Epices' }));
    expect(props.onOpenObject).toHaveBeenCalledWith('obj-2');
  });

  it('crée une tâche : titre + établissement résolu par nom (datalist annuaire) + échéance', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle tâche/i }));
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Relancer les photos' } });
    fireEvent.change(screen.getByLabelText('Établissement'), { target: { value: 'Hotel Basalte & Lagon' } });
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-06-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(crmMock.saveCrmTask).toHaveBeenCalledWith({
        objectId: 'obj-1',
        title: 'Relancer les photos',
        dueAt: '2026-06-20',
      }),
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

  it('échec de bascule → erreur visible (pas d échec silencieux)', async () => {
    crmMock.saveCrmTask.mockRejectedValue(new Error('refus RLS'));
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: 'Basculer la tâche « Rappeler le directeur »' }));
    expect(await screen.findByText(/refus RLS/)).toBeInTheDocument();
  });

  it('sans permission : checkboxes et création désactivées avec raison (no-write-trap)', async () => {
    renderTaches({ canWrite: false });
    await screen.findByText('Rappeler le directeur');
    expect(screen.getByRole('button', { name: 'Basculer la tâche « Rappeler le directeur »' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /nouvelle tâche/i })).toBeDisabled();
    expect(screen.getAllByText(/lecture seule/i).length).toBeGreaterThan(0);
  });
});
