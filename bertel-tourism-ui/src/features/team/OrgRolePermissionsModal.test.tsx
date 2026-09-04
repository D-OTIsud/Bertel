import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrgRolePermissionsModal } from './OrgRolePermissionsModal';
import type { MemberRef } from './role-permission-matrix';

jest.mock('@/services/rbac', () => ({
  setRolePermission: jest.fn().mockResolvedValue(undefined),
  friendlyRbacError: (e: { message?: string }) => e?.message ?? 'Action impossible.',
}));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { setRolePermission } = require('@/services/rbac') as { setRolePermission: jest.Mock };

const CATALOG = [
  { code: 'manage_actor_portal_access', name: 'Gérer l’accès au portail prestataire', category: 'crm' },
  { code: 'write_crm_notes', name: 'Écrire dans le CRM', category: 'crm' },
  { code: 'edit_hours', name: 'Horaires', category: 'content' },
];
const ROLES = [
  { code: 'viewer', name: 'Lecteur', rank: null, position: 1 },
  { code: 'editor', name: 'Éditeur', rank: null, position: 3 },
];
const MATRIX = { viewer: [], editor: ['write_crm_notes', 'edit_hours'] };
const MEMBERS: MemberRef[] = [
  { userId: 'u1', displayName: 'Isabelle', businessRoleCode: 'viewer', individualCodes: [] },
  { userId: 'u2', displayName: 'Nicolas', businessRoleCode: 'viewer', individualCodes: [] },
  { userId: 'u3', displayName: 'Marc', businessRoleCode: 'editor', individualCodes: [] },
];

function renderModal() {
  return render(
    <OrgRolePermissionsModal
      open orgId="ORG1" catalog={CATALOG} roles={ROLES} matrix={MATRIX} members={MEMBERS}
      onClose={jest.fn()} onChanged={jest.fn()}
    />,
  );
}

beforeEach(() => setRolePermission.mockClear());

describe('OrgRolePermissionsModal', () => {
  it('permet d’accorder aux éditeurs la permission portail initialement décochée', async () => {
    renderModal();
    const checkbox = screen.getByRole('checkbox', { name: 'Gérer l’accès au portail prestataire — Éditeur' });
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(setRolePermission).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: /Accorder/i }));
    expect(setRolePermission).toHaveBeenCalledWith('ORG1', 'editor', 'manage_actor_portal_access', true);
  });

  it('chaque case est adressable par permission ET par rôle', async () => {
    renderModal();
    expect(screen.getByRole('checkbox', { name: 'Écrire dans le CRM — Lecteur' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Écrire dans le CRM — Éditeur' })).toBeChecked();
  });

  // LA garde du chantier : un clic ne doit JAMAIS écrire directement. C'est exactement ce qui
  // manquait au bloc « Permissions par défaut de l'organisation » le 2026-08-31.
  it('cocher n’écrit rien : une confirmation nomme d’abord les membres impactés', async () => {
    renderModal();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Écrire dans le CRM — Lecteur' }));
    expect(setRolePermission).not.toHaveBeenCalled();
    expect(await screen.findByText(/Isabelle, Nicolas/)).toBeInTheDocument();
    expect(screen.getByText(/Gagnent ce droit immédiatement/)).toBeInTheDocument();
    // « 2 membres » apparaît aussi dans l'en-tête de colonne — on cible le décompte de la
    // confirmation, pas celui de la matrice.
    expect(screen.getByText('2 membres', { selector: 'strong' })).toBeInTheDocument();
  });

  it('annuler la confirmation n’écrit rien', async () => {
    renderModal();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Écrire dans le CRM — Lecteur' }));
    await userEvent.click(await screen.findByRole('button', { name: /Annuler/i }));
    expect(setRolePermission).not.toHaveBeenCalled();
  });

  it('confirmer écrit la bascule demandée, et elle seule', async () => {
    renderModal();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Écrire dans le CRM — Lecteur' }));
    await userEvent.click(await screen.findByRole('button', { name: /Accorder/i }));
    expect(setRolePermission).toHaveBeenCalledTimes(1);
    expect(setRolePermission).toHaveBeenCalledWith('ORG1', 'viewer', 'write_crm_notes', true);
  });

  it('un retrait annonce les membres qui PERDENT le droit', async () => {
    renderModal();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Écrire dans le CRM — Éditeur' }));
    expect(await screen.findByText(/Marc/)).toBeInTheDocument();
    expect(screen.getByText(/Perdent/)).toBeInTheDocument();
  });

  // Le piège de la fausse fermeture : retirer le droit du rôle ne le retire pas à qui le porte
  // en exception. L'écran doit le dire, sinon l'admin croit avoir fermé un accès resté ouvert.
  it('avertit qu’une exception individuelle survit au retrait', async () => {
    render(
      <OrgRolePermissionsModal
        open orgId="ORG1" catalog={CATALOG} roles={ROLES} matrix={MATRIX}
        members={[{ userId: 'u4', displayName: 'Sophie', businessRoleCode: 'editor', individualCodes: ['write_crm_notes'] }]}
        onClose={jest.fn()} onChanged={jest.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Écrire dans le CRM — Éditeur' }));
    expect(await screen.findByText(/Sophie garde ce droit/)).toBeInTheDocument();
  });
});
