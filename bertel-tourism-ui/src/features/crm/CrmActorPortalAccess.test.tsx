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
  mocked.invitePortalAccess.mockResolvedValue({ traced: true });
  mocked.resendPortalAccess.mockResolvedValue({ traced: true });
  mocked.revokePortalAccess.mockResolvedValue({ traced: true });
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

    // Renvoyer envoie un e-mail ET invalide le lien précédent : même exigence de
    // confirmation que l'invitation (le `findBy` laisse passer les microtâches, donc la
    // mutation aurait eu le temps de partir si le clic la déclenchait).
    const dialog = await screen.findByRole('dialog', { name: /Renvoyer l’invitation/ });
    expect(dialog).toHaveTextContent('marie@basalte.re');
    expect(mocked.resendPortalAccess).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Renvoyer' }));
    await waitFor(() => expect(mocked.resendPortalAccess).toHaveBeenCalledWith(ACTOR, 'marie@basalte.re'));
  });

  // Cette combinaison — statut LU, écriture refusée — est celle d'un agent en lecture seule,
  // et elle EXISTE parce que la route gate `status` sur `user_can_read_crm_actor` et non sur
  // le prédicat d'écriture. Avec un `status` gaté en écriture, `canWrite=false` répondrait
  // 403 sur chaque fiche : la carte tomberait dans son bras d'erreur et ce test validerait
  // une branche morte.
  it('lecture seule : l’état du compte reste LISIBLE, seules les actions sont désactivées', async () => {
    mocked.getPortalAccessStatus.mockResolvedValue({
      account: { userId: 'u1', email: 'marie@basalte.re', invitedAt: '2026-08-01T09:00:00Z', lastSignInAt: null },
      linkedToOtherAccount: false,
    });
    renderCard({ canWrite: false });

    // Pas de bandeau de panne : l'agent voit bien l'état, il ne peut simplement pas agir.
    expect(await screen.findByText('marie@basalte.re')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const resend = await screen.findByRole('button', { name: 'Renvoyer l’invitation' });
    expect(resend).toBeDisabled();
    expect(resend).toHaveAttribute('title', CRM_READ_ONLY_REASON);
    const revoke = screen.getByRole('button', { name: 'Révoquer' });
    expect(revoke).toBeDisabled();
    expect(revoke).toHaveAttribute('title', CRM_READ_ONLY_REASON);
    // La raison est AUSSI à l'écran : un `title` ne se lit ni au doigt ni par toutes les
    // aides techniques. Même règle que le bras « pas de compte ».
    expect(screen.getByText(CRM_READ_ONLY_REASON)).toBeInTheDocument();
  });

  // IMPORTANT 7 se refermait au serveur mais pas à l'écran : la route rend `traced`, le
  // service le jetait. Une trace manquée redevenait invisible à l'agent — le silence
  // simplement déplacé d'un cran.
  it('trace CRM manquée : le geste est annoncé RÉUSSI, et le défaut de journalisation est dit', async () => {
    mocked.getPortalAccessStatus.mockResolvedValue({
      account: { userId: 'u1', email: 'marie@basalte.re', invitedAt: '2026-08-01T09:00:00Z', lastSignInAt: null },
      linkedToOtherAccount: false,
    });
    mocked.revokePortalAccess.mockResolvedValue({ traced: false });
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Révoquer' }));
    await screen.findByRole('dialog', { name: /Révoquer l’accès portail/ });
    const confirmButtons = screen.getAllByRole('button', { name: 'Révoquer' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('L’accès a été révoqué, mais l’action n’a pas pu être journalisée dans le CRM.');
    // Pas une alerte : le geste a réussi, recommencer serait une erreur.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('trace CRM manquée sur l’invitation : le message nomme le geste réellement accompli', async () => {
    noAccount();
    mocked.invitePortalAccess.mockResolvedValue({ traced: false });
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: /Inviter/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer l’invitation' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'L’accès a été ouvert, mais l’action n’a pas pu être journalisée dans le CRM.',
    );
  });

  it('trace CRM réussie : aucun message parasite', async () => {
    noAccount();
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: /Inviter/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer l’invitation' }));

    await waitFor(() => expect(mocked.invitePortalAccess).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
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
