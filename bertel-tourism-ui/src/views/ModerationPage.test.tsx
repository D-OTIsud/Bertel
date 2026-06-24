import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModerationPage } from './ModerationPage';
import * as rpc from '../services/rpc';
import type { PendingChangeItem } from '../types/domain';

jest.mock('../services/rpc');
const mock = rpc as jest.Mocked<typeof rpc>;

const ITEM: PendingChangeItem = {
  id: 'pc-1',
  objectId: 'HOTRUN0000000001',
  objectName: 'Hôtel Basalte',
  author: 'Jean Martin',
  field: 'lieu_dit',
  before: 'Bras-Long',
  after: 'Bras Long',
  submittedAt: '2026-03-12T14:30:00Z',
  status: 'pending',
  targetTable: 'object',
  action: 'update',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ModerationPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mock.listPendingChanges.mockResolvedValue([ITEM]);
  mock.approvePendingChange.mockResolvedValue(undefined);
  mock.rejectPendingChange.mockResolvedValue(undefined);
});

describe('ModerationPage (P2.1)', () => {
  it('renders the pending suggestion (before / after / object / author)', async () => {
    renderPage();
    expect(await screen.findByText('Bras-Long')).toBeInTheDocument();
    expect(screen.getByText('Bras Long')).toBeInTheDocument();
    expect(screen.getByText(/Hôtel Basalte/)).toBeInTheDocument();
    expect(screen.getByText(/Jean Martin/)).toBeInTheDocument();
  });

  it('shows an honest empty state when there is nothing to moderate', async () => {
    mock.listPendingChanges.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Aucune suggestion à modérer')).toBeInTheDocument();
  });

  it('approves a change via approvePendingChange', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Approuver/i }));
    await waitFor(() => expect(mock.approvePendingChange).toHaveBeenCalledWith('pc-1', null));
  });

  it('rejecting requires a non-empty note (modal) before calling rejectPendingChange', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Rejeter/i }));
    // Modal open: confirm button present, but submitting empty must NOT call the RPC.
    const confirm = await screen.findByRole('button', { name: /Confirmer le refus|Rejeter la suggestion/i });
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/obligatoire/i));
    expect(mock.rejectPendingChange).not.toHaveBeenCalled();

    // With a note → calls the RPC.
    fireEvent.change(screen.getByLabelText(/Motif du refus/i), { target: { value: 'Donnée erronée' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mock.rejectPendingChange).toHaveBeenCalledWith('pc-1', 'Donnée erronée'));
  });

  it('changing the status filter re-queries with the new status', async () => {
    renderPage();
    await screen.findByText('Bras-Long');
    fireEvent.change(screen.getByLabelText(/Statut/i), { target: { value: 'applied' } });
    await waitFor(() => expect(mock.listPendingChanges).toHaveBeenCalledWith('applied'));
  });
});
