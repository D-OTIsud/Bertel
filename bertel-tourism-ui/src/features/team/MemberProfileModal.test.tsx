import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemberProfileModal } from './MemberProfileModal';
import type { OrgMember } from '@/services/rbac';
import {
  getMemberProfile,
  updateMemberProfile,
  uploadMemberAvatar,
  sendMemberSignInLink,
  sendMemberMagicLink,
} from '@/services/team-profile';

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
const mockedUploadAvatar = jest.mocked(uploadMemberAvatar);
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
  mockedUploadAvatar.mockReset().mockResolvedValue('https://cdn/new-avatar.jpg');
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

it('resynchronise le formulaire quand la modale rouvre sur un AUTRE membre — AVANT toute résolution de chargement', async () => {
  // Le chargement ne résout JAMAIS : si le test passait grâce au useEffect(userId) qui
  // reposerait 'Bob' une fois getMemberProfile('u2') résolu, il rougirait ici. Ce qui doit
  // porter la valeur de Bob, c'est la resynchronisation PENDANT LE RENDU, pas le chargement.
  mockedGet.mockImplementation(() => new Promise(() => {}));

  const { rerender } = renderModal(alice);
  await waitFor(() => expect(screen.getByLabelText(/Nom affiché/i)).toHaveValue('Alice'));

  // L'état diverge visiblement des props initiales — un useEffect(userId) sur le membre
  // PRÉCÉDENT ne le corrigerait jamais (userId ne change pas tant qu'on reste sur Alice).
  fireEvent.change(screen.getByLabelText(/Nom affiché/i), { target: { value: 'Alice Martin' } });

  // Fermeture puis réouverture sur Bob SANS démontage (Modal reste monté pour son animation).
  rerender(<MemberProfileModal member={null} canEditPlatformRole onClose={() => {}} onSaved={() => {}} />);
  rerender(<MemberProfileModal member={bob} canEditPlatformRole onClose={() => {}} onSaved={() => {}} />);

  await waitFor(() => expect(screen.getByLabelText(/Nom affiché/i)).toHaveValue('Bob'));
  expect(screen.getByLabelText(/Nom affiché/i)).not.toHaveValue('Alice Martin');
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
  // Le motif doit être ACCESSIBLE (aria-describedby pointant le paragraphe), pas seulement
  // visible à côté du select : sans l'attribut, ce texte resterait invisible aux lecteurs d'écran.
  expect(select).toHaveAccessibleDescription(/Seul un owner/i);
});

it('affiche l’avertissement sur la conséquence d’un changement d’e-mail', async () => {
  renderModal(alice);
  expect(await screen.findByText(/fiches dont ce membre est propriétaire/i)).toBeInTheDocument();
});

it('n’envoie que les champs modifiés à l’enregistrement', async () => {
  renderModal(alice);
  // Attend la fin du chargement AVANT d'éditer (le libellé « Enregistrer » n'apparaît qu'une
  // fois `loaded` posé — le bouton reste « Chargement du profil… » avant). Éditer PLUS TÔT
  // serait écrasé par le setName(p.displayName) du chargement une fois celui-ci résolu pendant
  // l'attente qui suit.
  await screen.findByRole('button', { name: /^Enregistrer$/i });
  fireEvent.change(screen.getByLabelText(/Nom affiché/i), { target: { value: 'Alice Martin' } });
  fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));
  await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith({ userId: 'u1', displayName: 'Alice Martin' }));
});

it('désactive Enregistrer tant que le profil n’a pas fini de charger', () => {
  // Titre corrigé (revue finale, BLOQUANT 5) : ce test ne couvrait PAS l'échec de chargement — une
  // promesse qui ne résout jamais n'est pas un rejet. L'échec réel est couvert par les deux tests
  // ci-dessous.
  mockedGet.mockImplementation(() => new Promise(() => {})); // ne résout jamais
  renderModal(alice);
  const saveButton = screen.getByRole('button', { name: /Chargement du profil/i });
  expect(saveButton).toBeDisabled();
  fireEvent.click(saveButton);
  expect(mockedUpdate).not.toHaveBeenCalled();
});

// BLOQUANT 5 (revue finale) — avant ce correctif, un échec de getMemberProfile laissait le bouton
// bloqué sur « Chargement du profil… » pour toujours (motif énoncé devenu FAUX : plus rien ne
// charge), sans aucune façon de réessayer.
it('distingue un échec de chargement d’un chargement en cours, avec un motif vrai et un réessai', async () => {
  mockedGet.mockReset().mockRejectedValueOnce(new Error('boum réseau'));
  renderModal(alice);

  const retryButton = await screen.findByRole('button', { name: /Réessayer le chargement/i });
  expect(retryButton).not.toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent(/chargement du profil a échoué/i);
  expect(retryButton).toHaveAccessibleDescription(/chargement du profil a échoué/i);

  mockedGet.mockResolvedValueOnce(profileOf('Alice'));
  fireEvent.click(retryButton);

  await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('button', { name: /^Enregistrer$/i })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('le réessai ne déclenche jamais un enregistrement', async () => {
  mockedGet.mockReset().mockRejectedValueOnce(new Error('boum réseau')).mockImplementation(() => new Promise(() => {}));
  renderModal(alice);
  fireEvent.click(await screen.findByRole('button', { name: /Réessayer le chargement/i }));
  expect(mockedUpdate).not.toHaveBeenCalled();
});

it('n’affiche pas des initiales tirées de l’e-mail quand aucun nom réel n’est enregistré', () => {
  mockedGet.mockImplementation(() => new Promise(() => {})); // fige l'état posé par la resync
  const noRealName: OrgMember = { ...alice, displayName: alice.email };
  renderModal(noRealName);
  expect(screen.getByLabelText(/Nom affiché/i)).toHaveValue(alice.email);
  expect(screen.getByText('?')).toBeInTheDocument();
});

// BLOQUANT 4 (revue finale) — la SEULE assertion d'enregistrement de ce fichier portait sur
// `{ userId, displayName }` : ni `patch.email`, ni `patch.platformRole`, ni
// `uploadMemberAvatar(member.userId, file)` n'étaient couverts. Un correctif qui casserait le
// calcul du diff d'e-mail ou de rôle produirait exactement la signature d'un piège d'écriture
// (champ éditable, toast de succès, rien d'écrit) sans qu'aucun test ne rougisse.
it('envoie le patch e-mail quand l’adresse de connexion est modifiée', async () => {
  renderModal(alice);
  await screen.findByRole('button', { name: /^Enregistrer$/i });
  fireEvent.change(screen.getByLabelText(/E-mail de connexion/i), { target: { value: 'nouvelle@oti.re' } });
  fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));
  await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith({ userId: 'u1', email: 'nouvelle@oti.re' }));
});

it('envoie le patch platformRole quand le rôle plateforme est modifié (canEditPlatformRole vrai)', async () => {
  renderModal(alice, true);
  await screen.findByRole('button', { name: /^Enregistrer$/i });
  fireEvent.change(screen.getByLabelText(/Rôle plateforme/i), { target: { value: 'super_admin' } });
  fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));
  await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith({ userId: 'u1', platformRole: 'super_admin' }));
});

it('choisir un fichier appelle uploadMemberAvatar avec l’identifiant DU MEMBRE, jamais celui de l’appelant', async () => {
  renderModal(bob); // bob.userId === 'u2' — distinct de tout id d'appelant
  await screen.findByRole('button', { name: /^Enregistrer$/i });
  const file = new File(['x'], 'a.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText(/ajouter une photo/i), { target: { files: [file] } });
  await waitFor(() => expect(mockedUploadAvatar).toHaveBeenCalledWith('u2', file));
});
