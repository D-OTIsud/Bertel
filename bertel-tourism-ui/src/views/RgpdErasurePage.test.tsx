import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import RgpdErasurePage from './RgpdErasurePage';
import { requestErasure } from '@/services/rgpd';

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
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/services/rgpd', () => ({
  ...jest.requireActual('@/services/rgpd'),
  requestErasure: jest.fn(),
}));

const requestErasureMock = requestErasure as jest.MockedFunction<typeof requestErasure>;
const VALID_UUID = '11111111-1111-4111-8111-111111111111';

function setUuidSubject() {
  fireEvent.click(screen.getByText(/coller un UUID/i));
  fireEvent.change(screen.getByLabelText(/Identifiant du sujet/i), { target: { value: VALID_UUID } });
}

describe('RgpdErasurePage', () => {
  beforeEach(() => {
    mockRole = 'super_admin';
    requestErasureMock.mockReset();
    requestErasureMock.mockResolvedValue({
      ok: true,
      report: {},
      storageDeleted: [],
      storageError: null,
      authUserDeleted: false,
      authError: null,
    });
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
});
