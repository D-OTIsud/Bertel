import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CrmPage from './CrmPage';
import * as crm from '../services/crm';
import { mockCrmTasks, mockCrmTimeline } from '../data/mock';

jest.mock('../services/crm');
jest.mock('../hooks/usePresenceRoom', () => ({
  usePresenceRoom: () => ({ peers: [], typingUsers: [], announceTyping: jest.fn() }),
}));

const crmMock = crm as jest.Mocked<typeof crm>;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CrmPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listCrmTasks.mockResolvedValue(mockCrmTasks);
  crmMock.listCrmTimeline.mockResolvedValue(mockCrmTimeline);
  crmMock.userCanWriteCrmNotes.mockResolvedValue(true);
  crmMock.saveCrmTask.mockResolvedValue('task-1');
});

describe('CrmPage (§58 — données réelles)', () => {
  it('groupe les tâches sur les lanes de l enum DB (todo/in_progress/done)', async () => {
    renderPage();
    expect(await screen.findByText('Rappeler le directeur')).toBeInTheDocument();
    expect(screen.getByText('Valider le contrat photo')).toBeInTheDocument(); // in_progress
    expect(screen.getByText('Confirmer les horaires d hiver')).toBeInTheDocument(); // done
  });

  it('persiste un déplacement de lane via saveCrmTask', async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: /avancer/i }))[0]);
    await waitFor(() =>
      expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-1', status: 'in_progress' }),
    );
  });

  it('désactive l écriture avec raison sans write_crm_notes (no-write-trap)', async () => {
    crmMock.userCanWriteCrmNotes.mockResolvedValue(false);
    renderPage();
    await screen.findByText('Rappeler le directeur');
    expect(screen.queryByRole('button', { name: /avancer/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/lecture seule/i).length).toBeGreaterThan(0);
  });

  it('ne rend plus le bouton démo « Simuler une note »', async () => {
    renderPage();
    await screen.findByText('Rappeler le directeur');
    expect(screen.queryByText('Simuler une note')).not.toBeInTheDocument();
  });

  it('affiche la timeline réelle (sujet, objet, sentiment) et « Charger plus » si has_more', async () => {
    crmMock.listCrmTimeline.mockResolvedValue({ ...mockCrmTimeline, hasMore: true });
    renderPage();
    expect(await screen.findByText('Appel de suivi')).toBeInTheDocument();
    expect(screen.getByText(/Hotel Basalte & Lagon · Demande de visite · Positif/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /charger plus/i })).toBeInTheDocument();
  });

  it('affiche une erreur quand le déplacement échoue (pas d échec silencieux)', async () => {
    crmMock.saveCrmTask.mockRejectedValue(new Error('refus RLS'));
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: /avancer/i }))[0]);
    expect(await screen.findByText(/Échec du déplacement/)).toBeInTheDocument();
  });

  it('garde la page rendue pendant « Charger plus » (pas de collapse)', async () => {
    crmMock.listCrmTimeline.mockResolvedValue({ ...mockCrmTimeline, hasMore: true });
    renderPage();
    await screen.findByText('Appel de suivi');
    crmMock.listCrmTimeline.mockReturnValue(new Promise<never>(() => {})); // page 2 jamais résolue
    fireEvent.click(screen.getByRole('button', { name: /charger plus/i }));
    expect(screen.getByText('Rappeler le directeur')).toBeInTheDocument(); // kanban toujours là
    expect(screen.queryByText('Chargement du CRM...')).not.toBeInTheDocument();
  });
});
