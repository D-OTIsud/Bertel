import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import RgpdErasurePage from './RgpdErasurePage';
import { requestErasure, resumeErasureCleanup } from '@/services/rgpd';
import { toast } from 'sonner';

let mockRole = 'super_admin';

jest.mock('@/store/session-store', () => ({
  useSessionStore: (selector: (state: { role: string }) => unknown) => selector({ role: mockRole }),
}));
jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) },
  }),
}));
jest.mock('@/services/object-workspace', () => ({
  searchActors: jest.fn().mockResolvedValue([]),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/services/rgpd', () => ({
  ...jest.requireActual('@/services/rgpd'),
  requestErasure: jest.fn(),
  resumeErasureCleanup: jest.fn(),
}));

const requestErasureMock = requestErasure as jest.MockedFunction<typeof requestErasure>;
const resumeErasureCleanupMock = resumeErasureCleanup as jest.MockedFunction<typeof resumeErasureCleanup>;
const VALID_UUID = '11111111-1111-4111-8111-111111111111';

const COMPLETED_RESULT = {
  ok: true,
  status: 'completed' as const,
  operationId: 'op-1',
  report: {},
  tasks: [],
  cleanupStatusUnavailable: false,
  counts: { total: 0, succeeded: 0, pending: 0, failed: 0 },
};

function setUuidSubject() {
  fireEvent.click(screen.getByText(/coller un UUID/i));
  fireEvent.change(screen.getByLabelText(/Identifiant du sujet/i), { target: { value: VALID_UUID } });
}

describe('RgpdErasurePage', () => {
  beforeEach(() => {
    mockRole = 'super_admin';
    requestErasureMock.mockReset();
    resumeErasureCleanupMock.mockReset();
    requestErasureMock.mockResolvedValue(COMPLETED_RESULT);
    (toast.success as jest.Mock).mockClear();
    (toast.warning as jest.Mock).mockClear();
  });

  it('rend une carte « accès refusé » (role=alert) pour un non-référent', () => {
    mockRole = 'editor';
    render(<RgpdErasurePage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Accès réservé/i)).toBeInTheDocument();
  });

  it('le clic sur Soumettre ouvre la modale et n\'appelle pas requestErasure', async () => {
    render(<RgpdErasurePage />);
    setUuidSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Anonymiser le sujet' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(requestErasureMock).not.toHaveBeenCalled();
  });

  it('confirmer en anonymisation appelle requestErasure (pas de garde de saisie)', async () => {
    render(<RgpdErasurePage />);
    setUuidSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Anonymiser le sujet' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anonymiser' }));
    await waitFor(() => expect(requestErasureMock).toHaveBeenCalledTimes(1));
  });

  it('en suppression, la confirmation exige la saisie-pour-confirmer', async () => {
    render(<RgpdErasurePage />);
    fireEvent.click(screen.getByRole('radio', { name: /Supprimer/i }));
    setUuidSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le sujet' }));
    const dialog = await screen.findByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: 'Supprimer le sujet' });
    expect(confirmBtn).toHaveAttribute('aria-disabled', 'true'); // D10 : bloqué mais joignable
    fireEvent.click(confirmBtn); // clic gardé tant que la saisie ne correspond pas
    expect(requestErasureMock).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/SUPPRIMER/i), { target: { value: 'SUPPRIMER' } });
    expect(confirmBtn).not.toHaveAttribute('aria-disabled');
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(requestErasureMock).toHaveBeenCalledTimes(1));
  });

  it('un résultat partial affiche un toast warning, ne réinitialise pas le formulaire, et propose la reprise', async () => {
    requestErasureMock.mockResolvedValue({
      ...COMPLETED_RESULT,
      ok: false,
      status: 'partial',
      counts: { total: 2, succeeded: 1, pending: 1, failed: 0 },
    });
    render(<RgpdErasurePage />);
    setUuidSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Anonymiser le sujet' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anonymiser' }));
    await waitFor(() => expect(requestErasureMock).toHaveBeenCalledTimes(1));

    expect(toast.warning).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    // Le formulaire n'est PAS réinitialisé sur un résultat non complet (permet de retenter/suivre).
    expect(screen.getByLabelText(/Identifiant du sujet/i)).toHaveValue(VALID_UUID);
    expect(screen.getByRole('button', { name: /reprendre/i })).toBeInTheDocument();
  });

  it('le bouton de reprise appelle resumeErasureCleanup avec le operationId sauvegardé, jamais requestErasure à nouveau', async () => {
    requestErasureMock.mockResolvedValue({
      ...COMPLETED_RESULT,
      ok: false,
      status: 'partial',
      operationId: 'op-resume-me',
      counts: { total: 2, succeeded: 1, pending: 1, failed: 0 },
    });
    resumeErasureCleanupMock.mockResolvedValue({ ...COMPLETED_RESULT, operationId: 'op-resume-me' });

    render(<RgpdErasurePage />);
    setUuidSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Anonymiser le sujet' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anonymiser' }));
    await waitFor(() => expect(requestErasureMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /reprendre/i }));
    await waitFor(() => expect(resumeErasureCleanupMock).toHaveBeenCalledTimes(1));
    expect(resumeErasureCleanupMock).toHaveBeenCalledWith('op-resume-me', 'tok');
    expect(requestErasureMock).toHaveBeenCalledTimes(1); // jamais rappelé
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});
