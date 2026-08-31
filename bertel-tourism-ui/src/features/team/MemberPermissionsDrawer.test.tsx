import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemberPermissionsDrawer } from './MemberPermissionsDrawer';
import type { OrgMember } from '@/services/rbac';

jest.mock('@/services/rbac', () => ({
  grantUserPermission: jest.fn().mockResolvedValue(undefined),
  revokeUserPermission: jest.fn().mockResolvedValue(undefined),
  friendlyRbacError: (e: { message?: string }) => e?.message ?? 'Action impossible.',
}));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rbac = require('@/services/rbac') as { grantUserPermission: jest.Mock; revokeUserPermission: jest.Mock };

const CATALOG = [
  { code: 'write_crm_notes', name: 'Écrire dans le CRM', category: 'crm' },
  { code: 'edit_hours', name: 'Horaires', category: 'content' },
];
const MATRIX = { viewer: [], editor: ['write_crm_notes'] };

const base: OrgMember = {
  membershipId: 'm1', userId: 'u1', email: 'isabelle@example.re', displayName: 'Isabelle',
  isActive: true, businessRoleCode: 'viewer', adminRoleCode: null,
  permissionCodes: [], lastSeenAt: null, rolePermissionCodes: [], isPlatformSuperuser: false,
};

function renderDrawer(member: OrgMember, onOpenRoleMatrix?: () => void) {
  return render(
    <MemberPermissionsDrawer
      member={member} catalog={CATALOG} roleMatrix={MATRIX}
      onOpenRoleMatrix={onOpenRoleMatrix} onClose={jest.fn()} onChanged={jest.fn()}
    />,
  );
}

beforeEach(() => { rbac.grantUserPermission.mockClear(); rbac.revokeUserPermission.mockClear(); });

describe('MemberPermissionsDrawer — §227', () => {
  // LA correction du chantier : le bloc « Permissions par défaut de l'organisation » vivait ici,
  // sous les cases du membre, avec des cases identiques. Un clic y accordait à TOUTE l'équipe.
  it('ne contient plus aucun contrôle de portée ORG', () => {
    renderDrawer(base);
    expect(screen.queryByText(/permissions par défaut de l’organisation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/héritée de l’ORG/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /org/i })).not.toBeInTheDocument();
  });

  it('un Lecteur voit explicitement qu’il n’a aucun droit d’écriture', () => {
    renderDrawer(base);
    expect(screen.getByText(/Lecture seule\. Aucun droit d’écriture\./)).toBeInTheDocument();
  });

  it('les droits du rôle sont listés en lecture seule, hors des cases à cocher', () => {
    renderDrawer({ ...base, businessRoleCode: 'editor', rolePermissionCodes: ['write_crm_notes'] });
    const roleSection = screen.getByRole('heading', { name: /Droits du rôle Éditeur/ }).closest('section');
    expect(roleSection).not.toBeNull();
    expect(roleSection!.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(roleSection!.textContent).toContain('Écrire dans le CRM');
  });

  // Une case décochée sous un droit déjà conféré se lirait « ce droit manque » : un admin la
  // cocherait pour « réparer » et créerait un doublon. L'état indéterminé dit la vérité.
  it('une permission venue du rôle affiche l’état indéterminé, pas décoché', () => {
    renderDrawer({ ...base, businessRoleCode: 'editor' });
    const box = screen.getByRole('checkbox', { name: /Écrire dans le CRM/ }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.indeterminate).toBe(true);
    expect(screen.getByText(/déjà acquise via le rôle Éditeur/)).toBeInTheDocument();
  });

  it('cocher une exception individuelle appelle le bon octroi', async () => {
    renderDrawer(base);
    await userEvent.click(screen.getByRole('checkbox', { name: /Horaires/ }));
    expect(rbac.grantUserPermission).toHaveBeenCalledWith('u1', 'edit_hours');
  });

  it('le réglage des rôles est proposé en lien, jamais en case dans ce tiroir', async () => {
    const open = jest.fn();
    renderDrawer(base, open);
    await userEvent.click(screen.getByRole('button', { name: /Régler les permissions par rôle/ }));
    expect(open).toHaveBeenCalled();
  });
});
