import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { PartnerKeysSettings } from './PartnerKeysSettings';
import * as service from '../../services/partner-keys';
import { useSessionStore } from '../../store/session-store';

jest.mock('../../services/partner-keys');
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

let mockOnIssued: () => void;
jest.mock('./IssuePartnerKeyModal', () => {
  const actual = jest.requireActual('./IssuePartnerKeyModal');
  const React = jest.requireActual('react');
  return {
    ...actual,
    IssuePartnerKeyModal: (props: { onIssued: () => void }) => {
      mockOnIssued = props.onIssued;
      return React.createElement(actual.IssuePartnerKeyModal, props);
    },
  };
});

const listMock = service.listPartnerKeys as jest.Mock;
const issueMock = service.issuePartnerKey as jest.Mock;
const revokeMock = service.revokePartnerKey as jest.Mock;
const activeKey: service.PartnerKey = {
  id: 'k1', label: 'Portail régional', keyPrefix: 'bk_live_ab12cd34', scopes: [], isActive: true,
  expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-07-01T09:00:00Z',
};
const issuedKey: service.IssuedPartnerKey = {
  id: 'k2', apiKey: 'bk_live_' + 'a'.repeat(48), keyPrefix: 'bk_live_aaaaaaaa', label: 'Nouveau tiers',
};

beforeEach(() => {
  jest.clearAllMocks();
  listMock.mockReset().mockResolvedValue([activeKey]);
  issueMock.mockReset();
  revokeMock.mockReset().mockResolvedValue(true);
  useSessionStore.setState({ userId: 'admin-1', orgId: 'org-1', role: 'super_admin' });
});

async function openIssue() {
  fireEvent.click(screen.getAllByRole('button', { name: /Émettre une clé/ })[0]);
  return screen.findByRole('dialog', { name: 'Émettre une clé partenaire' });
}

async function openRevoke() {
  const trigger = await screen.findByRole('button', { name: 'Révoquer la clé Portail régional' });
  trigger.focus();
  fireEvent.click(trigger);
  return screen.findByRole('dialog', { name: 'Révoquer la clé partenaire ?' });
}

describe('PartnerKeysSettings', () => {
  it('renders a compact semantic table and keeps the prefix in the name tooltip only', async () => {
    render(<PartnerKeysSettings />);
    const name = await screen.findByRole('cell', { name: 'Portail régional' });
    expect(name).toHaveAttribute('title', 'Clé bk_live_ab12cd34…');
    expect(screen.queryByText(/bk_live_ab12cd34/)).not.toBeInTheDocument();
    expect(screen.getByText('1 active')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Partenaire', 'Dernier usage', 'Créée le', 'Expiration', 'Actions',
    ]);
    expect(screen.getByRole('button', { name: 'Révoquer la clé Portail régional' })).toHaveAttribute('title', 'Révoquer');
    expect(screen.queryByText(/Historique —/)).not.toBeInTheDocument();
  });

  it('shows an empty state with an action opening the issue modal', async () => {
    listMock.mockResolvedValue([]);
    render(<PartnerKeysSettings />);
    const message = await screen.findByText(/Aucune clé partenaire émise/);
    fireEvent.click(within(message.parentElement!).getByRole('button', { name: /Émettre une clé/ }));
    expect(await screen.findByRole('dialog', { name: 'Émettre une clé partenaire' })).toBeInTheDocument();
  });

  it('keeps revoked history hidden until expanded and shows its count', async () => {
    const revoked = { ...activeKey, id: 'old-1', label: 'Ancien partenaire', isActive: false, revokedAt: '2026-11-10T08:00:00Z' };
    listMock.mockResolvedValue([activeKey, revoked, { ...revoked, id: 'old-2', label: 'Autre ancien partenaire' }]);
    render(<PartnerKeysSettings />);
    const summary = await screen.findByText('Historique — 2 clés révoquées');
    const history = summary.closest('details')!;
    expect(history).not.toHaveAttribute('open');
    expect(screen.getByText('Ancien partenaire')).not.toBeVisible();
    expect(screen.getByText('Autre ancien partenaire')).not.toBeVisible();
    fireEvent.click(summary);
    expect(history).toHaveAttribute('open');
    expect(screen.getByText('Ancien partenaire')).toBeVisible();
    expect(screen.getByText('Autre ancien partenaire')).toBeVisible();
    expect(within(history).queryByRole('button')).not.toBeInTheDocument();
    expect(within(history).getByText(/Une clé révoquée ne peut pas être réactivée/)).toBeVisible();
  });

  it('keeps history accessible when there are no active keys', async () => {
    listMock.mockResolvedValue([{ ...activeKey, isActive: false, revokedAt: '2026-11-10T08:00:00Z' }]);
    render(<PartnerKeysSettings />);
    expect(await screen.findByText(/Historique — 1 clé révoquée/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Révoquer la clé Portail régional' })).not.toBeInTheDocument();
    expect(screen.queryByText(/0 actives/)).not.toBeInTheDocument();
  });
});

describe('PartnerKeysSettings — issue modal', () => {
  it('starts with a focused empty name, rejects whitespace and supports Enter submission', async () => {
    const user = userEvent.setup();
    issueMock.mockResolvedValue(issuedKey);
    render(<PartnerKeysSettings />);
    await screen.findByText('Portail régional');
    const dialog = await openIssue();
    const input = within(dialog).getByLabelText('Nom du partenaire');
    const submit = within(dialog).getByRole('button', { name: 'Émettre la clé' });
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('maxlength', '120');
    expect(submit).toBeDisabled();
    await user.type(input, '   ');
    expect(submit).toBeDisabled();
    await user.clear(input);
    await user.type(input, '  Nouveau tiers  {Enter}');
    expect(await screen.findByRole('dialog', { name: 'Clé pour « Nouveau tiers »' })).toBeInTheDocument();
    expect(screen.getAllByText(issuedKey.apiKey)).toHaveLength(1);
    expect(screen.getByText(/plus jamais affichée/)).toBeInTheDocument();
    expect(screen.getByText(/canal sûr/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copier' })).toBeInTheDocument();
    expect(issueMock).toHaveBeenCalledTimes(1);
    expect(issueMock).toHaveBeenCalledWith('Nouveau tiers');
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
  });

  it.each(['acknowledge', 'escape', 'outside', 'close'] as const)('purges the secret immediately after %s and reopens with an empty form', async (method) => {
    issueMock.mockResolvedValue(issuedKey);
    render(<PartnerKeysSettings />);
    await screen.findByText('Portail régional');
    const form = await openIssue();
    fireEvent.change(within(form).getByLabelText('Nom du partenaire'), { target: { value: issuedKey.label } });
    fireEvent.click(within(form).getByRole('button', { name: 'Émettre la clé' }));
    const dialog = await screen.findByRole('dialog', { name: 'Clé pour « Nouveau tiers »' });
    if (method === 'acknowledge') fireEvent.click(within(dialog).getByRole('button', { name: 'J’ai copié la clé' }));
    if (method === 'escape') fireEvent.keyDown(dialog, { key: 'Escape' });
    if (method === 'outside') fireEvent.mouseDown(dialog.closest('.app-modal-overlay')!);
    if (method === 'close') fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByText(issuedKey.apiKey)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const reopened = await openIssue();
    expect(within(reopened).getByLabelText('Nom du partenaire')).toHaveValue('');
    expect(screen.queryByText(issuedKey.apiKey)).not.toBeInTheDocument();
  });

  it('copies the currently displayed secret to the clipboard', async () => {
    const user = userEvent.setup();
    const copy = jest.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    issueMock.mockResolvedValue(issuedKey);
    render(<PartnerKeysSettings />);
    await screen.findByText('Portail régional');
    const dialog = await openIssue();
    fireEvent.change(within(dialog).getByLabelText('Nom du partenaire'), { target: { value: issuedKey.label } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Émettre la clé' }));
    await screen.findByText(issuedKey.apiKey);
    await user.click(screen.getByRole('button', { name: 'Copier' }));
    expect(copy).toHaveBeenCalledWith(issuedKey.apiKey);
    expect(toast.success).toHaveBeenCalledWith('Clé copiée dans le presse-papier.');
    copy.mockRestore();
  });

  it('preserves the form and reports an issue failure for retry', async () => {
    issueMock.mockRejectedValueOnce(new Error('Émission hors ligne')).mockResolvedValueOnce(issuedKey);
    render(<PartnerKeysSettings />);
    await screen.findByText('Portail régional');
    const dialog = await openIssue();
    fireEvent.change(within(dialog).getByLabelText('Nom du partenaire'), { target: { value: issuedKey.label } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Émettre la clé' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Émission hors ligne'));
    expect(within(dialog).getByLabelText('Nom du partenaire')).toHaveValue(issuedKey.label);
    expect(within(dialog).getByRole('button', { name: 'Émettre la clé' })).toBeEnabled();
    expect(listMock).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Émettre la clé' }));
    expect(await screen.findByText(issuedKey.apiKey)).toBeInTheDocument();
  });

  it('prevents duplicate submission while issuing', async () => {
    let finish!: (key: service.IssuedPartnerKey) => void;
    issueMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<PartnerKeysSettings />);
    await screen.findByText('Portail régional');
    const dialog = await openIssue();
    const input = within(dialog).getByLabelText('Nom du partenaire');
    fireEvent.change(input, { target: { value: issuedKey.label } });
    const form = input.closest('form')!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(within(dialog).getByRole('button', { name: 'Émission…' })).toBeDisabled();
    expect(issueMock).toHaveBeenCalledTimes(1);
    await act(async () => finish(issuedKey));
  });

  it('ignores a late secret after closing and reopening a pending issue', async () => {
    let finish!: (key: service.IssuedPartnerKey) => void;
    issueMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<PartnerKeysSettings />);
    await screen.findByText('Portail régional');
    const dialog = await openIssue();
    fireEvent.change(within(dialog).getByLabelText('Nom du partenaire'), { target: { value: issuedKey.label } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Émettre la clé' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const reopened = await openIssue();
    await act(async () => finish(issuedKey));
    expect(screen.queryByText(issuedKey.apiKey)).not.toBeInTheDocument();
    expect(within(reopened).getByLabelText('Nom du partenaire')).toHaveValue('');
  });

  it.each(['user', 'org', 'role'] as const)('discards a late secret after an identity %s change', async (change) => {
    let finish!: (key: service.IssuedPartnerKey) => void;
    issueMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<PartnerKeysSettings />);
    await screen.findByText('Portail régional');
    const dialog = await openIssue();
    fireEvent.change(within(dialog).getByLabelText('Nom du partenaire'), { target: { value: issuedKey.label } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Émettre la clé' }));
    act(() => {
      if (change === 'user') useSessionStore.setState({ userId: 'admin-2' });
      if (change === 'org') useSessionStore.setState({ orgId: 'org-2' });
      if (change === 'role') useSessionStore.setState({ role: 'tourism_agent' });
    });
    await act(async () => finish(issuedKey));
    expect(screen.queryByText(issuedKey.apiKey)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('PartnerKeysSettings — shared revocation confirmation', () => {
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
    expect(screen.getByRole('button', { name: 'Révoquer la clé Portail régional' })).toHaveFocus();
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
    expect(await screen.findByText(/Historique — 1 clé révoquée/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Clés API partenaire' })).toHaveFocus());
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
    const another = { ...activeKey, id: 'k2', label: 'Autre partenaire', keyPrefix: 'bk_live_another' };
    const refreshed = change === 'removed' ? [another]
      : change === 'inactive' ? [{ ...activeKey, isActive: false }, another]
      : change === 'changed' ? [{ ...activeKey, label: 'Nouveau propriétaire' }, another]
      : [another, activeKey];
    listMock.mockResolvedValueOnce([activeKey]).mockResolvedValueOnce(refreshed);
    render(<PartnerKeysSettings />);
    const dialog = await openRevoke();
    // The actual modal is tested above. Its completion callback provides a concurrent
    // refresh event here so these assertions continue to isolate revocation guards.
    await act(async () => mockOnIssued());
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
      if (change !== 'changed') await waitFor(() => expect(screen.getByRole('heading', { name: 'Clés API partenaire' })).toHaveFocus());
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
    let finishRefresh!: (value: service.PartnerKey[]) => void;
    listMock.mockResolvedValueOnce([activeKey]).mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve; }));
    render(<PartnerKeysSettings />);
    const dialog = await openRevoke();
    act(() => mockOnIssued());
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
    listMock.mockResolvedValueOnce([activeKey]).mockRejectedValueOnce(new Error('Actualisation hors ligne'))
      .mockResolvedValueOnce([{ ...activeKey, isActive: false }]);
    render(<PartnerKeysSettings />);
    const dialog = await openRevoke();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Actualisation hors ligne');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText(/Historique — 1 clé révoquée/)).toBeInTheDocument();
    expect(revokeMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Révoquer la clé Portail régional' })).not.toBeInTheDocument();
  });
});
