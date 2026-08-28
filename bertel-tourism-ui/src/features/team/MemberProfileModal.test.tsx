import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemberProfileModal } from './MemberProfileModal';
import type { OrgMember } from '@/services/rbac';
import { getMemberProfile, updateMemberProfile, sendMemberSignInLink, sendMemberMagicLink } from '@/services/team-profile';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/services/team-profile', () => ({
  getMemberProfile: jest.fn(),
  updateMemberProfile: jest.fn(),
  uploadMemberAvatar: jest.fn(),
  sendMemberSignInLink: jest.fn(),
  sendMemberMagicLink: jest.fn(),
}));

const mockedGet = jest.mocked(getMemberProfile);
const mockedUpdate = jest.mocked(updateMemberProfile);
const mockedSignIn = jest.mocked(sendMemberSignInLink);
const mockedMagic = jest.mocked(sendMemberMagicLink);

const alice: OrgMember = {
  membershipId: 'm1', userId: 'u1', email: 'alice@oti.re', displayName: 'Alice',
  isActive: true, businessRoleCode: 'editor', adminRoleCode: null,
  permissionCodes: [], lastSeenAt: null, inheritedPermissionCodes: [], isPlatformSuperuser: false,
};
const bob: OrgMember = { ...alice, membershipId: 'm2', userId: 'u2', email: 'bob@oti.re', displayName: 'Bob' };

function profileOf(name: string, role = 'tourism_agent') {
  return { displayName: name, avatarUrl: null, email: `${name.toLowerCase()}@oti.re`, platformRole: role, lastSignInAt: null };
}

beforeEach(() => {
  mockedGet.mockReset().mockImplementation(async (id) => profileOf(id === 'u1' ? 'Alice' : 'Bob'));
  mockedUpdate.mockReset().mockResolvedValue(undefined);
  mockedSignIn.mockReset().mockResolvedValue(undefined);
  mockedMagic.mockReset().mockResolvedValue(undefined);
});

function renderModal(member: OrgMember | null, canEditPlatformRole = true) {
  return render(
    <MemberProfileModal member={member} canEditPlatformRole={canEditPlatformRole} onClose={() => {}} onSaved={() => {}} />,
  );
}

it('rend le nom chargé du membre', async () => {
  renderModal(alice);
  await waitFor(() => expect(screen.getByLabelText(/Nom affiché/i)).toHaveValue('Alice'));
});

it('resynchronise le formulaire quand la modale rouvre sur un AUTRE membre', async () => {
  const { rerender } = renderModal(alice);
  await waitFor(() => expect(screen.getByLabelText(/Nom affiché/i)).toHaveValue('Alice'));

  // Fermeture puis réouverture sur Bob SANS démontage (Modal reste monté pour son animation).
  rerender(<MemberProfileModal member={null} canEditPlatformRole onClose={() => {}} onSaved={() => {}} />);
  rerender(<MemberProfileModal member={bob} canEditPlatformRole onClose={() => {}} onSaved={() => {}} />);

  await waitFor(() => expect(screen.getByLabelText(/Nom affiché/i)).toHaveValue('Bob'));
});

it('libelle « Renvoyer l’invitation » pour un compte jamais connecté', async () => {
  renderModal({ ...alice, lastSeenAt: null });
  expect(await screen.findByRole('button', { name: /Renvoyer l’invitation/i })).toBeInTheDocument();
});

it('libelle « Réinitialiser le mot de passe » pour un compte déjà connecté', async () => {
  renderModal({ ...alice, lastSeenAt: '2026-08-01T10:00:00Z' });
  expect(await screen.findByRole('button', { name: /Réinitialiser le mot de passe/i })).toBeInTheDocument();
});

it('les deux libellés déclenchent le MÊME envoi', async () => {
  renderModal({ ...alice, lastSeenAt: null });
  fireEvent.click(await screen.findByRole('button', { name: /Renvoyer l’invitation/i }));
  await waitFor(() => expect(mockedSignIn).toHaveBeenCalledWith('alice@oti.re'));
});

it('envoie un lien de connexion à usage unique', async () => {
  renderModal(alice);
  fireEvent.click(await screen.findByRole('button', { name: /lien de connexion/i }));
  await waitFor(() => expect(mockedMagic).toHaveBeenCalledWith('alice@oti.re'));
});

it('désactive le rôle plateforme avec un motif accessible pour un non-owner', async () => {
  renderModal(alice, false);
  const select = await screen.findByLabelText(/Rôle plateforme/i);
  expect(select).toBeDisabled();
  expect(screen.getByText(/Seul un owner/i)).toBeInTheDocument();
});

it('affiche l’avertissement sur la conséquence d’un changement d’e-mail', async () => {
  renderModal(alice);
  expect(await screen.findByText(/fiches dont ce membre est propriétaire/i)).toBeInTheDocument();
});

it('n’envoie que les champs modifiés à l’enregistrement', async () => {
  renderModal(alice);
  await waitFor(() => expect(screen.getByLabelText(/Nom affiché/i)).toHaveValue('Alice'));
  fireEvent.change(screen.getByLabelText(/Nom affiché/i), { target: { value: 'Alice Martin' } });
  fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));
  await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith({ userId: 'u1', displayName: 'Alice Martin' }));
});
