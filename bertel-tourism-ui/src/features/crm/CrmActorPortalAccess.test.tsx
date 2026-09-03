import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmActorPortalAccess } from './CrmActorPortalAccess';
import * as actorAccess from '../../services/actor-access';
import { CRM_READ_ONLY_REASON } from './crm-view-utils';

jest.mock('../../services/actor-access');

const mocked = actorAccess as jest.Mocked<typeof actorAccess>;

const ACTOR = 'actor-1';

function renderCard(
  overrides: Partial<Parameters<typeof CrmActorPortalAccess>[0]> = {},
) {
  const props = {
    actorId: ACTOR,
    canWrite: true,
    emailChannels: ['marie@basalte.re'],
    ...overrides,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CrmActorPortalAccess {...props} />
    </QueryClientProvider>,
  );
  return props;
}

function noAccount() {
  mocked.getPortalAccessStatus.mockResolvedValue({ account: null, linkedToOtherAccount: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.invitePortalAccess.mockResolvedValue(undefined);
  mocked.resendPortalAccess.mockResolvedValue(undefined);
  mocked.revokePortalAccess.mockResolvedValue(undefined);
});

describe('CrmActorPortalAccess — aucun accès encore ouvert', () => {
  it('propose « Inviter » avec l’adresse, et n’envoie RIEN avant confirmation', async () => {
    noAccount();
    renderCard();

    const invite = await screen.findByRole('button', { name: /Inviter/ });
    expect(invite).toBeEnabled();
    fireEvent.click(invite);

    // Une invitation part par e-mail : le geste DOIT passer par une confirmation. Le
    // `findBy` laisse passer les microtâches — si le clic déclenchait la mutation, elle
    // aurait eu le temps de partir avant l'assertion qui suit.
    const dialog = await screen.findByRole('dialog', { name: /Ouvrir l’accès au portail/ });
    // La confirmation NOMME l'adresse : c'est ce que l'agent doit relire avant d'envoyer.
    expect(dialog).toHaveTextContent('marie@basalte.re');
    expect(mocked.invitePortalAccess).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));
    await waitFor(() => expect(mocked.invitePortalAccess).toHaveBeenCalledWith(ACTOR, 'marie@basalte.re'));
  });

  it('SANS canal e-mail : le bouton est désactivé AVEC l’explication, et un clic n’envoie rien', async () => {
    noAccount();
    renderCard({ emailChannels: [] });

    const invite = await screen.findByRole('button', { name: /Inviter/ });
    expect(invite).toBeDisabled();
    expect(screen.getByText('Ajoutez d’abord une adresse e-mail à cet acteur.')).toBeInTheDocument();
    fireEvent.click(invite);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocked.invitePortalAccess).not.toHaveBeenCalled();
  });

  it('plusieurs adresses : l’agent choisit celle qui reçoit l’invitation', async () => {
    noAccount();
    renderCard({ emailChannels: ['contact@basalte.re', 'marie@basalte.re'] });

    const select = await screen.findByRole('combobox', { name: 'Adresse à inviter' });
    fireEvent.change(select, { target: { value: 'marie@basalte.re' } });
    fireEvent.click(screen.getByRole('button', { name: /Inviter/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));
    await waitFor(() => expect(mocked.invitePortalAccess).toHaveBeenCalledWith(ACTOR, 'marie@basalte.re'));
  });

  it('lecture seule : le bouton est désactivé avec la raison standard du CRM', async () => {
    noAccount();
    renderCard({ canWrite: false });

    const invite = await screen.findByRole('button', { name: /Inviter/ });
    expect(invite).toBeDisabled();
    expect(invite).toHaveAttribute('title', CRM_READ_ONLY_REASON);
    fireEvent.click(invite);
    expect(mocked.invitePortalAccess).not.toHaveBeenCalled();
  });

  it('acteur déjà rattaché à un compte interne : invitation impossible, raison affichée', async () => {
    mocked.getPortalAccessStatus.mockResolvedValue({ account: null, linkedToOtherAccount: true });
    renderCard();

    const invite = await screen.findByRole('button', { name: /Inviter/ });
    expect(invite).toBeDisabled();
    expect(
      screen.getByText(/déjà rattaché à un compte interne/i),
    ).toBeInTheDocument();
  });
});

describe('CrmActorPortalAccess — un accès existe', () => {
  it('compte actif : e-mail, badge « Actif », pas de renvoi, révocation confirmée', async () => {
    mocked.getPortalAccessStatus.mockResolvedValue({
      account: {
        userId: 'u1',
        email: 'marie@basalte.re',
        invitedAt: '2026-08-01T09:00:00Z',
        lastSignInAt: '2026-08-20T09:00:00Z',
      },
      linkedToOtherAccount: false,
    });
    renderCard();

    expect(await screen.findByText('marie@basalte.re')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Renvoyer/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Révoquer' }));
    await screen.findByRole('dialog', { name: /Révoquer l’accès portail/ });
    expect(mocked.revokePortalAccess).not.toHaveBeenCalled();

    // Le libellé du bouton de confirmation, dans le dialogue (le bouton de la carte porte
    // le même mot) : on prend le dernier rendu, celui du pied de la fenêtre.
    const confirmButtons = screen.getAllByRole('button', { name: 'Révoquer' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(mocked.revokePortalAccess).toHaveBeenCalledWith(ACTOR));
  });

  it('invité jamais connecté : badge « Invité » et « Renvoyer l’invitation »', async () => {
    mocked.getPortalAccessStatus.mockResolvedValue({
      account: { userId: 'u1', email: 'marie@basalte.re', invitedAt: '2026-08-01T09:00:00Z', lastSignInAt: null },
      linkedToOtherAccount: false,
    });
    renderCard();

    expect(await screen.findByText('Invité')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Renvoyer l’invitation' }));
    await waitFor(() => expect(mocked.resendPortalAccess).toHaveBeenCalledWith(ACTOR, 'marie@basalte.re'));
  });

  it('lecture seule : « Renvoyer » et « Révoquer » sont désactivés avec la raison standard', async () => {
    mocked.getPortalAccessStatus.mockResolvedValue({
      account: { userId: 'u1', email: 'marie@basalte.re', invitedAt: '2026-08-01T09:00:00Z', lastSignInAt: null },
      linkedToOtherAccount: false,
    });
    renderCard({ canWrite: false });

    const resend = await screen.findByRole('button', { name: 'Renvoyer l’invitation' });
    expect(resend).toBeDisabled();
    expect(resend).toHaveAttribute('title', CRM_READ_ONLY_REASON);
    const revoke = screen.getByRole('button', { name: 'Révoquer' });
    expect(revoke).toBeDisabled();
    expect(revoke).toHaveAttribute('title', CRM_READ_ONLY_REASON);
  });

  it('un refus du serveur est affiché en clair, sans laisser croire que c’est parti', async () => {
    noAccount();
    mocked.invitePortalAccess.mockRejectedValue(
      new Error('Cette adresse est déjà celle d’un compte interne — elle ne peut pas servir d’accès partenaire.'),
    );
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: /Inviter/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/compte interne/);
  });

  it('l’échec du chargement du statut ne se déguise pas en « aucun accès »', async () => {
    mocked.getPortalAccessStatus.mockRejectedValue(new Error('Session expirée — reconnectez-vous.'));
    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Session expirée — reconnectez-vous.');
    expect(screen.queryByRole('button', { name: /Inviter/ })).not.toBeInTheDocument();
  });
});
