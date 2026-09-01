import { render, screen, fireEvent, act } from '@testing-library/react';
import TeamAdminPage from './TeamAdminPage';
import { useSessionStore } from '@/store/session-store';
import { listOrgs } from '@/services/orgs';
import { listOrgMembers, listBusinessRoles, type OrgMember, type RefRole } from '@/services/rbac';
import { getMemberProfile } from '@/services/team-profile';

// ---------------------------------------------------------------------------------------
// Task 6 (revue) — le seul test de page existant, TeamAdminPage.orgselect.test.tsx, mocke
// `listOrgMembers` sur `[]` : aucune ligne de membre n'y est jamais rendue, donc rien n'y
// protège le câblage de la modale de profil (Task 5 → Task 6), ni les deux décisions que le
// plan jugeait assez contre-intuitives pour les justifier par écrit :
//   · `canEditPlatformRole={role === 'owner'}` — PAS `isSuperuser` : c'est ce que
//     `api.is_platform_owner()` reconnaît côté serveur ;
//   · `<MemberProfileModal>` monté INCONDITIONNELLEMENT (jamais `{editingProfile && …}`) —
//     Modal joue sa propre animation de sortie via usePresence, qui exige de rester monté.
// Ce fichier rend un roster d'UNE ligne pour éprouver les deux, plus le câblage lui-même.
// ---------------------------------------------------------------------------------------

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() } }));

jest.mock('@/services/orgs', () => ({ listOrgs: jest.fn() }));

jest.mock('@/services/rbac', () => ({
  listOrgMembers: jest.fn(),
  listBusinessRoles: jest.fn(),
  listAdminRoles: jest.fn().mockResolvedValue([]),
  listPermissionCatalog: jest.fn().mockResolvedValue([]),
  listRolePermissions: jest.fn().mockResolvedValue({}),
  setBusinessRole: jest.fn().mockResolvedValue(undefined),
  setAdminRole: jest.fn().mockResolvedValue(undefined),
  revokeAdminRole: jest.fn().mockResolvedValue(undefined),
  deactivateMembership: jest.fn().mockResolvedValue(undefined),
  deleteUserAccount: jest.fn().mockResolvedValue(undefined),
  grantUserPermission: jest.fn().mockResolvedValue(undefined),
  friendlyRbacError: (e: { message?: string }) => e?.message ?? '',
}));

jest.mock('@/services/team-profile', () => ({
  getMemberProfile: jest.fn(),
  updateMemberProfile: jest.fn().mockResolvedValue(undefined),
  uploadMemberAvatar: jest.fn(),
  sendMemberSignInLink: jest.fn().mockResolvedValue(undefined),
  sendMemberMagicLink: jest.fn().mockResolvedValue(undefined),
}));

const ALICE: OrgMember = {
  membershipId: 'm1',
  userId: 'u1',
  email: 'alice@oti.re',
  displayName: 'Alice',
  isActive: true,
  businessRoleCode: 'editor',
  adminRoleCode: null,
  permissionCodes: [],
  lastSeenAt: null,
  rolePermissionCodes: [],
  isPlatformSuperuser: false,
};

/** L'appelant (admin1) n'est jamais le membre édité (Alice) — "Modifier" ne s'affiche jamais
 *  sur sa propre ligne, et un `orgId` de session fixe évite tout sélecteur d'ORG superflu. */
function setSession(role: 'owner' | 'super_admin') {
  useSessionStore.setState({ role, adminRank: null, orgId: 'ORGA', userId: 'admin1' } as never);
}

beforeEach(() => {
  (listOrgs as jest.Mock).mockReset().mockResolvedValue([]);
  (listOrgMembers as jest.Mock).mockReset();
  (listBusinessRoles as jest.Mock).mockReset().mockResolvedValue([]);
  (getMemberProfile as jest.Mock).mockReset().mockImplementation(() => new Promise(() => {})); // jamais résolue : sans effet sur ces assertions
  window.history.replaceState(null, '', '/settings?section=team');
});

afterEach(() => {
  jest.useRealTimers();
});

async function openProfileModal(role: 'owner' | 'super_admin') {
  setSession(role);
  (listOrgMembers as jest.Mock).mockResolvedValue([ALICE]);
  render(<TeamAdminPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Modifier le profil de Alice' }));
  return screen.findByRole('dialog', { name: 'Profil de Alice' });
}

describe('TeamAdminPage — câblage de la modale de profil (Task 6)', () => {
  test('1. cliquer « Modifier » ouvre la modale (assertion sur un élément propre à la modale)', async () => {
    const dialog = await openProfileModal('owner');
    expect(dialog).toBeInTheDocument();
    // Pas seulement le déclencheur : un champ qui n'existe que DANS la modale.
    expect(screen.getByLabelText(/Nom affiché/i)).toBeInTheDocument();
  });

  test('2. avec un owner, le select « Rôle plateforme » de la modale est actif', async () => {
    await openProfileModal('owner');
    expect(screen.getByLabelText(/Rôle plateforme/i)).toBeEnabled();
  });

  test('3. avec un super_admin (superuser, mais PAS owner), ce select reste désactivé — interdit l’« harmonisation » avec isSuperuser', async () => {
    await openProfileModal('super_admin');
    expect(screen.getByLabelText(/Rôle plateforme/i)).toBeDisabled();
  });

  test('4. la modale reste montée pendant sa sortie — jamais entourée d’un `&&`', async () => {
    await openProfileModal('owner');
    const closeButton = screen.getByRole('button', { name: 'Fermer' });

    jest.useFakeTimers();
    fireEvent.click(closeButton);
    // Encore dans le DOM, en phase 'exiting' : si `<MemberProfileModal>` était rendu sous
    // `{editingProfile && <MemberProfileModal .../>}`, React l'aurait démonté d'un coup à ce
    // clic (editingProfile devient null dans le MÊME commit) — la phase 'exiting' n'aurait
    // jamais l'occasion d'apparaître. C'est la seule assertion honnête trouvée pour ce point :
    // l'absence de contenu seule ne distinguerait pas "jamais monté" de "démonté d'un coup".
    expect(screen.getByRole('dialog').closest('[data-motion-phase]')).toHaveAttribute('data-motion-phase', 'exiting');

    // Passé le délai de sortie (220ms, variant "modal"), le composant se démonte enfin.
    act(() => { jest.advanceTimersByTime(220); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('5. le membre édité SUIT les mises à jour du roster — dérivé par identifiant, jamais figé sur l’objet du clic', async () => {
    setSession('owner');
    (listOrgMembers as jest.Mock)
      .mockResolvedValueOnce([ALICE])
      .mockResolvedValue([{ ...ALICE, displayName: 'Alice Renommée' }]);
    const bizRoles: RefRole[] = [
      { code: 'viewer', name: 'Lecteur', rank: null, position: 1 },
      { code: 'editor', name: 'Éditeur', rank: null, position: 2 },
    ];
    (listBusinessRoles as jest.Mock).mockResolvedValue(bizRoles);

    render(<TeamAdminPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier le profil de Alice' }));
    expect(await screen.findByRole('dialog', { name: 'Profil de Alice' })).toBeInTheDocument();

    // Déclenche un reload SANS toucher à la modale : changer le rôle métier recharge le roster
    // (`changeBusinessRole` appelle `reload()` inconditionnellement).
    fireEvent.change(screen.getByRole('combobox', { name: 'Rôle métier de Alice' }), { target: { value: 'viewer' } });

    // Si `editingProfile` était figé sur l'objet capturé au clic, le titre resterait
    // "Profil de Alice" pour toujours, même après le rechargement du roster.
    expect(await screen.findByRole('dialog', { name: 'Profil de Alice Renommée' })).toBeInTheDocument();
  });
});
