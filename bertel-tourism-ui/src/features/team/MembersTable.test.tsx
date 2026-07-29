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
