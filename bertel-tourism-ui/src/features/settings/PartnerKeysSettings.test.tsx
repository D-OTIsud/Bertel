import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PartnerKeysSettings } from './PartnerKeysSettings';
import * as service from '../../services/partner-keys';
import { useSessionStore } from '../../store/session-store';

jest.mock('../../services/partner-keys');
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const listMock = service.listPartnerKeys as jest.Mock;
const issueMock = service.issuePartnerKey as jest.Mock;
const revokeMock = service.revokePartnerKey as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ userId: 'admin-1', orgId: 'org-1', role: 'super_admin' });
});

describe('PartnerKeysSettings', () => {
  it('loads and renders existing keys (label + prefix + active badge)', async () => {
    listMock.mockResolvedValue([
      { id: 'k1', label: 'Portail régional', keyPrefix: 'bk_live_ab12cd34', scopes: [], isActive: true, expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-07-01T09:00:00Z' },
    ]);
    render(<PartnerKeysSettings />);
    expect(await screen.findByText('Portail régional')).toBeInTheDocument();
    expect(screen.getByText(/bk_live_ab12cd34/)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('empty state when no keys', async () => {
    listMock.mockResolvedValue([]);
    render(<PartnerKeysSettings />);
    expect(await screen.findByText(/Aucune clé partenaire émise/)).toBeInTheDocument();
  });

  it('issuing shows the raw key ONCE with a copy affordance', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue([]);
    const rawKey = 'bk_live_' + 'a'.repeat(48);
    issueMock.mockResolvedValue({ id: 'k2', apiKey: rawKey, keyPrefix: 'bk_live_aaaaaaaa', label: 'Nouveau tiers' });

    render(<PartnerKeysSettings />);
    await screen.findByText(/Aucune clé partenaire émise/);

    await user.type(screen.getByPlaceholderText(/Nom du prestataire/), 'Nouveau tiers');
    await user.click(screen.getByRole('button', { name: /Émettre une clé/ }));

    // The raw key is revealed exactly once, with the "won't be shown again" warning.
    expect(await screen.findByText(rawKey)).toBeInTheDocument();
    expect(screen.getByText(/plus jamais affichée/)).toBeInTheDocument();
    expect(issueMock).toHaveBeenCalledWith('Nouveau tiers');
  });
});

const activeKey: service.PartnerKey = {
  id: 'k1', label: 'Portail régional', keyPrefix: 'bk_live_ab12cd34', scopes: [], isActive: true,
  expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-07-01T09:00:00Z',
};

describe('PartnerKeysSettings — shared revocation confirmation', () => {
  beforeEach(() => {
    listMock.mockReset().mockResolvedValue([activeKey]);
    issueMock.mockReset();
    revokeMock.mockReset().mockResolvedValue(true);
  });

  async function openRevoke() {
    const trigger = await screen.findByRole('button', { name: 'Révoquer' });
    trigger.focus();
    fireEvent.click(trigger);
    return screen.findByRole('dialog', { name: 'Révoquer la clé partenaire ?' });
  }

  it.each(['cancel', 'escape', 'outside'] as const)('%s identifies only the partner/prefix, focuses cancel and restores the trigger without revoking', async (method) => {
    const rawKey = activeKey.keyPrefix + 'private-secret-never-in-the-confirmation';
    listMock.mockResolvedValue([{ ...activeKey, apiKey: rawKey }]);
    render(<PartnerKeysSettings />);
    const dialog = await openRevoke();
    expect(dialog).toHaveTextContent('Portail régional');
    expect(dialog).toHaveTextContent('bk_live_ab12cd34…');
    expect(dialog).toHaveTextContent('immédiatement');
    expect(dialog).toHaveTextContent('irréversible');
    expect(dialog).not.toHaveTextContent(rawKey);
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    if (method === 'cancel') fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    if (method === 'escape') fireEvent.keyDown(dialog, { key: 'Escape' });
    if (method === 'outside') fireEvent.mouseDown(dialog.parentElement!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Révoquer' })).toHaveFocus();
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('revokes the stable ID once, ignores busy dismissal and restores focus when refreshed trigger vanishes', async () => {
    let finish!: (value: boolean) => void;
    revokeMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    listMock.mockResolvedValueOnce([activeKey]).mockResolvedValueOnce([{ ...activeKey, isActive: false, revokedAt: '2026-10-29T00:00:00Z' }]);
    render(<PartnerKeysSettings />);
    const dialog = await openRevoke();
    const confirm = within(dialog).getByRole('button', { name: 'Révoquer' });
    act(() => { confirm.click(); confirm.click(); });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(dialog.parentElement!);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toBeDisabled();
    expect(revokeMock).toHaveBeenCalledTimes(1);
    expect(revokeMock).toHaveBeenCalledWith('k1');
    await act(async () => finish(true));
    expect(await screen.findByText('Révoquée')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Accès partenaires' })).toHaveFocus());
  });

  it('keeps errors inside the dialog and permits a retry of the same ID', async () => {
    revokeMock.mockRejectedValueOnce(new Error('Révocation hors ligne')).mockResolvedValueOnce(true);
    render(<PartnerKeysSettings />);
    const dialog = await openRevoke();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Révocation hors ligne');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer' }));
    await waitFor(() => expect(revokeMock).toHaveBeenCalledTimes(2));
    expect(revokeMock).toHaveBeenNthCalledWith(2, 'k1');
  });

  it.each(['removed', 'inactive', 'changed', 'reordered'] as const)('rechecks current membership after a %s refresh', async (change) => {
    let finishIssue!: (value: service.IssuedPartnerKey) => void;
    issueMock.mockImplementation(() => new Promise((resolve) => { finishIssue = resolve; }));
    const another = { ...activeKey, id: 'k2', label: 'Autre partenaire', keyPrefix: 'bk_live_another' };
    const refreshed = change === 'removed' ? [another]
      : change === 'inactive' ? [{ ...activeKey, isActive: false }, another]
      : change === 'changed' ? [{ ...activeKey, label: 'Nouveau propriétaire' }, another]
      : [another, activeKey];
    listMock.mockResolvedValueOnce([activeKey]).mockResolvedValueOnce(refreshed);
    render(<PartnerKeysSettings />);
    await screen.findByText('Portail régional');
    fireEvent.change(screen.getByLabelText('Nom du partenaire'), { target: { value: 'Autre partenaire' } });
    fireEvent.click(screen.getByRole('button', { name: 'Émettre une clé' }));
    const dialog = await openRevoke();
    await act(async () => finishIssue({ id: 'k2', label: 'Autre partenaire', keyPrefix: 'bk_live_another', apiKey: 'bk_live_raw-issued-secret' }));
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
    expect(dialog).not.toHaveTextContent('bk_live_raw-issued-secret');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer' }));
    if (change === 'reordered') {
      await waitFor(() => expect(revokeMock).toHaveBeenCalledWith('k1'));
    } else {
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cette clé a changé ou n’est plus active');
      expect(revokeMock).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      if (change !== 'changed') await waitFor(() => expect(screen.getByRole('heading', { name: 'Accès partenaires' })).toHaveFocus());
    }
  });

  it.each(['user', 'org', 'role'] as const)('invalidates an obsolete owner confirmation on %s change', async (change) => {
    render(<PartnerKeysSettings />);
    const dialog = await openRevoke();
    const confirm = within(dialog).getByRole('button', { name: 'Révoquer' });
    act(() => {
      if (change === 'user') useSessionStore.setState({ userId: 'admin-2' });
      if (change === 'org') useSessionStore.setState({ orgId: 'org-2' });
      if (change === 'role') useSessionStore.setState({ role: 'tourism_agent' });
      confirm.click();
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('blocks confirmation while keys refresh and permits retry after the current list resolves', async () => {
    let finishIssue!: (value: service.IssuedPartnerKey) => void;
    let finishRefresh!: (value: service.PartnerKey[]) => void;
    issueMock.mockImplementation(() => new Promise((resolve) => { finishIssue = resolve; }));
    listMock.mockResolvedValueOnce([activeKey]).mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve; }));
    render(<PartnerKeysSettings />);
    await screen.findByText('Portail régional');
    fireEvent.change(screen.getByLabelText('Nom du partenaire'), { target: { value: 'Autre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Émettre une clé' }));
    const dialog = await openRevoke();
    await act(async () => finishIssue({ id: 'k2', label: 'Autre', keyPrefix: 'bk_live_another', apiKey: 'raw-secret' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Attendez le chargement');
    expect(revokeMock).not.toHaveBeenCalled();
    await act(async () => finishRefresh([activeKey]));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer' }));
    await waitFor(() => expect(revokeMock).toHaveBeenCalledWith('k1'));
  });
});

describe('PartnerKeysSettings — refresh outcome after revocation', () => {
  it('keeps a successful revocation committed when refresh fails and exposes the existing retry', async () => {
    listMock.mockReset().mockResolvedValueOnce([activeKey]).mockRejectedValueOnce(new Error('Actualisation hors ligne'))
      .mockResolvedValueOnce([{ ...activeKey, isActive: false }]);
    revokeMock.mockReset().mockResolvedValue(true);
    render(<PartnerKeysSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Révoquer' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Actualisation hors ligne');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Révoquée')).toBeInTheDocument();
    expect(revokeMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Révoquer' })).not.toBeInTheDocument();
  });
});
