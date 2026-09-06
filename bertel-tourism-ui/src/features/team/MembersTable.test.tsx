import { render, screen } from '@testing-library/react';
import { MembersTable } from './MembersTable';
import type { OrgMember } from '@/services/rbac';

const base: OrgMember = {
  membershipId: 'm1',
  userId: 'u1',
  email: 'a@b.c',
  displayName: 'Alice',
  isActive: true,
  businessRoleCode: 'editor',
  adminRoleCode: null,
  permissionCodes: [],
  lastSeenAt: null,
  inheritedPermissionCodes: [],
  isPlatformSuperuser: false,
};

function renderTable(members: OrgMember[]) {
  render(<MembersTable members={members} currentUserId={null} onManagePermissions={() => {}} />);
}

describe('MembersTable — colonne Dernière activité', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 29, 11, 11, 0));
  });
  afterEach(() => jest.useRealTimers());

  it('renders the date, the time and the relative gap of the last activity', () => {
    renderTable([{ ...base, lastSeenAt: new Date(2026, 6, 29, 9, 5, 0).toISOString() }]);

    expect(screen.getByRole('columnheader', { name: 'Dernière activité' })).toBeInTheDocument();
    expect(screen.getByText('29 juil. 2026 à 09:05')).toBeInTheDocument();
    expect(screen.getByText('il y a 2 h')).toBeInTheDocument();
  });

  it('says "Jamais" when the account has no known activity', () => {
    renderTable([base]);
    expect(screen.getByText('Jamais')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------
// Chantier 2026-08-28 n°1, sous-lot 1c — l'écran /team ne montrait pas l'accès qui compte.
// Mesuré en production : les 6 Éditeurs de l'OTI portent `team_lead` ou `org_admin`, et c'est
// de là que viennent leurs droits CRM — pas de leurs cases à cocher.
// ---------------------------------------------------------------------------------------
describe('MembersTable — provenance de l’accès (chantier 2026-08-28)', () => {
  it('D1 : le compteur inclut les droits HÉRITÉS de l’ORG, sans les compter deux fois', () => {
    renderTable([{
      ...base,
      permissionCodes: ['create_object', 'publish_object'],
      inheritedPermissionCodes: ['publish_object', 'write_crm_notes'],
    }]);
    // Union = create_object + publish_object + write_crm_notes = 3, pas 4.
    expect(screen.getByRole('button', { name: /3 permissions/ })).toBeInTheDocument();
    expect(screen.getByText(/dont 2 héritées/)).toBeInTheDocument();
  });

  it('D1 : un membre SANS droit individuel mais avec héritage n’affiche plus « 0 permission »', () => {
    renderTable([{ ...base, permissionCodes: [], inheritedPermissionCodes: ['write_crm_notes'] }]);
    expect(screen.getByRole('button', { name: /1 permission/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /0 permission/ })).not.toBeInTheDocument();
  });

  it('D4 : un rôle d’administration d’ORG est signalé — c’est lui qui ouvre l’écriture CRM', () => {
    renderTable([{ ...base, adminRoleCode: 'team_lead', permissionCodes: [] }]);
    expect(screen.getByText('+ rôle admin')).toBeInTheDocument();
  });

  it('D4 : le statut superuser est signalé, même avec zéro permission', () => {
    renderTable([{ ...base, isPlatformSuperuser: true, permissionCodes: [] }]);
    expect(screen.getByText('superuser')).toBeInTheDocument();
  });

  it('D4 : un simple lecteur ne porte AUCUNE pastille d’accès (pas de bruit)', () => {
    renderTable([{ ...base, businessRoleCode: 'viewer' }]);
    expect(screen.queryByText('superuser')).not.toBeInTheDocument();
    expect(screen.queryByText('+ rôle admin')).not.toBeInTheDocument();
    expect(screen.queryByText(/dont \d+ héritée/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------
// Task 6 — câblage de la modale de profil (MemberProfileModal, Task 5) depuis la liste des
// membres. Même règle que « Désactiver »/« Supprimer » : jamais sur sa propre ligne (son
// propre profil s'édite dans Réglages → Mon compte, pas ici).
// ---------------------------------------------------------------------------------------
describe('MembersTable — action Modifier', () => {
  it('rend le bouton Modifier sur une autre ligne que la sienne', () => {
    render(
      <MembersTable members={[base]} currentUserId="autre" onManagePermissions={() => {}} onEditProfile={() => {}} />,
    );
    // Le nom accessible nomme le membre (trois boutons "Modifier" identiques se répètent
    // d'une ligne à l'autre) — le texte VISIBLE reste "Modifier".
    expect(screen.getByRole('button', { name: 'Modifier le profil de Alice' })).toBeInTheDocument();
    expect(screen.getByText('Modifier')).toBeInTheDocument();
  });

  it('n’offre PAS Modifier sur sa propre ligne', () => {
    render(
      <MembersTable members={[base]} currentUserId="u1" onManagePermissions={() => {}} onEditProfile={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: 'Modifier le profil de Alice' })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------
// SEC-01 (audit sécurité 2026-09-05) — la suppression définitive est une capacité PLATEFORME :
// TeamAdminPage ne passe `onDelete` que pour un appelant owner/super_admin (pas un rang d'ORG
// local), et ce composant masque en plus le bouton sur une cible superuser tant que l'appelant
// n'est pas owner (le serveur reste seul autorité pour la distinction owner/super_admin fine).
// « Désactiver » reste offert dans tous les cas — c'est la voie qui reste aux admins d'ORG.
// ---------------------------------------------------------------------------------------
describe('MembersTable — action Supprimer (SEC-01)', () => {
  it('n’affiche pas Supprimer quand onDelete n’est pas fourni (admin d’ORG local)', () => {
    render(<MembersTable members={[base]} currentUserId="autre" onManagePermissions={() => {}} onDeactivate={() => {}} />);
    expect(screen.queryByText('Supprimer')).not.toBeInTheDocument();
    expect(screen.getByText('Désactiver')).toBeInTheDocument();
  });

  it('affiche Supprimer sur une cible ORDINAIRE dès que onDelete est fourni', () => {
    render(<MembersTable members={[base]} currentUserId="autre" onManagePermissions={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('Supprimer')).toBeInTheDocument();
  });

  it('masque Supprimer sur une cible SUPERUSER quand l’appelant n’est PAS owner', () => {
    render(
      <MembersTable
        members={[{ ...base, isPlatformSuperuser: true }]}
        currentUserId="autre"
        onManagePermissions={() => {}}
        onDelete={() => {}}
        callerIsOwner={false}
      />,
    );
    expect(screen.queryByText('Supprimer')).not.toBeInTheDocument();
  });

  it('offre Supprimer sur une cible SUPERUSER quand l’appelant EST owner (le serveur tranche owner vs super_admin)', () => {
    render(
      <MembersTable
        members={[{ ...base, isPlatformSuperuser: true }]}
        currentUserId="autre"
        onManagePermissions={() => {}}
        onDelete={() => {}}
        callerIsOwner
      />,
    );
    expect(screen.getByText('Supprimer')).toBeInTheDocument();
  });

  it('n’offre jamais Supprimer sur sa propre ligne, même owner', () => {
    render(
      <MembersTable
        members={[base]}
        currentUserId="u1"
        onManagePermissions={() => {}}
        onDelete={() => {}}
        callerIsOwner
      />,
    );
    expect(screen.queryByText('Supprimer')).not.toBeInTheDocument();
  });
});
