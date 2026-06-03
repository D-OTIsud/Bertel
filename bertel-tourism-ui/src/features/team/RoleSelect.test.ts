import { filterAssignableRoles } from './RoleSelect';
import type { RefRole } from '@/services/rbac';

const biz: RefRole[] = [
  { code: 'viewer', name: 'V', rank: null, position: 10 },
  { code: 'editor', name: 'E', rank: null, position: 30 },
];
const admin: RefRole[] = [
  { code: 'team_lead', name: 'T', rank: 10, position: null },
  { code: 'org_manager', name: 'M', rank: 20, position: null },
  { code: 'org_admin', name: 'A', rank: 30, position: null },
];

describe('filterAssignableRoles', () => {
  it('keeps all business roles (rank null) regardless of caller rank', () => {
    expect(filterAssignableRoles(biz, 20).map((r) => r.code)).toEqual(['viewer', 'editor']);
  });
  it('keeps only admin roles strictly below the caller rank', () => {
    expect(filterAssignableRoles(admin, 20).map((r) => r.code)).toEqual(['team_lead']);
    expect(filterAssignableRoles(admin, 30).map((r) => r.code)).toEqual(['team_lead', 'org_manager']);
  });
  it('superuser (Infinity) can assign all admin roles', () => {
    expect(filterAssignableRoles(admin, Infinity).map((r) => r.code)).toEqual(['team_lead', 'org_manager', 'org_admin']);
  });
});
