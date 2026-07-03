import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TeamAdminPage from './TeamAdminPage';
import { useSessionStore } from '@/store/session-store';
import { listOrgs } from '@/services/orgs';
import { listOrgMembers } from '@/services/rbac';

jest.mock('@/services/orgs', () => ({ listOrgs: jest.fn() }));
jest.mock('@/services/rbac', () => ({
  listOrgMembers: jest.fn().mockResolvedValue([]),
  listBusinessRoles: jest.fn().mockResolvedValue([]),
  listAdminRoles: jest.fn().mockResolvedValue([]),
  listPermissionCatalog: jest.fn().mockResolvedValue([]),
  listOrgPermissions: jest.fn().mockResolvedValue([]),
  friendlyRbacError: (e: { message?: string }) => e?.message ?? '',
}));

const ORGS = [
  { id: 'ORGA', name: 'OTI Alpha', status: 'published', regionCode: 'RUN', accessScope: 'own_objects_only', memberCount: 2, createdAt: '2026-07-03' },
  { id: 'ORGB', name: 'OTI Beta', status: 'published', regionCode: 'RUN', accessScope: 'all_published', memberCount: 0, createdAt: '2026-07-03' },
];

function setSession(over: Record<string, unknown>) {
  useSessionStore.setState({ role: 'super_admin', adminRank: null, orgId: null, userId: 'u1', ...over } as never);
}

beforeEach(() => {
  (listOrgs as jest.Mock).mockResolvedValue(ORGS);
  (listOrgMembers as jest.Mock).mockClear();
  window.history.replaceState(null, '', '/settings?section=team');
});

test('superadmin : sélecteur d’ORG, charge la première par défaut', async () => {
  setSession({});
  render(<TeamAdminPage />);
  await waitFor(() => expect(listOrgMembers).toHaveBeenCalledWith('ORGA'));
  expect(screen.getByRole('combobox', { name: /organisation/i })).toBeInTheDocument();
});

test('superadmin : changer de sélection recharge le roster de l’autre ORG', async () => {
  setSession({});
  render(<TeamAdminPage />);
  await waitFor(() => expect(listOrgMembers).toHaveBeenCalledWith('ORGA'));
  fireEvent.change(screen.getByRole('combobox', { name: /organisation/i }), { target: { value: 'ORGB' } });
  await waitFor(() => expect(listOrgMembers).toHaveBeenCalledWith('ORGB'));
});

test('superadmin : ?org= cible l’ORG demandée', async () => {
  window.history.replaceState(null, '', '/settings?section=team&org=ORGB');
  setSession({});
  render(<TeamAdminPage />);
  await waitFor(() => expect(listOrgMembers).toHaveBeenCalledWith('ORGB'));
});

test('non-superadmin avec ORG de session : pas de sélecteur', async () => {
  // adminRank >= 10 requis par canAdministerTeam (session-selectors.ts) pour qu'un
  // rôle non-superadmin voie la page — sans quoi le composant rend le panneau
  // "Accès réservé" et n'appelle jamais listOrgMembers, indépendamment du sélecteur d'ORG.
  setSession({ role: 'tourism_agent', adminRank: 10, orgId: 'ORGX' });
  render(<TeamAdminPage />);
  await waitFor(() => expect(listOrgMembers).toHaveBeenCalledWith('ORGX'));
  expect(screen.queryByRole('combobox', { name: /organisation/i })).not.toBeInTheDocument();
});
