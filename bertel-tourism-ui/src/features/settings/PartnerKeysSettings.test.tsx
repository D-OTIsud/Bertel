import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PartnerKeysSettings } from './PartnerKeysSettings';
import * as service from '../../services/partner-keys';

jest.mock('../../services/partner-keys');
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const listMock = service.listPartnerKeys as jest.Mock;
const issueMock = service.issuePartnerKey as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
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
