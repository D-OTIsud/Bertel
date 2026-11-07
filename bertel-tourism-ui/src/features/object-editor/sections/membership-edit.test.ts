import { appendCreatedOption, applyMembershipPatch, buildNewMembership } from './membership-edit';
import type { ObjectWorkspaceMembershipModule } from '../../../services/object-workspace-parser';

const mod = (): ObjectWorkspaceMembershipModule => ({
  campaignOptions: [{ id: 'c1', code: 'adhesion_2026', label: 'Adhésion 2026' }],
  tierOptions: [{ id: 't1', code: 'membre', label: 'Membre' }],
  scopeOptions: [{ orgObjectId: 'ORG1', label: 'OTI du Sud', isPrimary: true }],
  items: [],
  unavailableReason: null,
});

describe('membership-edit', () => {
  it('buildNewMembership seeds from the first scope/campaign/tier', () => {
    const item = buildNewMembership(mod());
    expect(item).not.toBeNull();
    expect(item).toMatchObject({ orgObjectId: 'ORG1', campaignCode: 'adhesion_2026', tierCode: 'membre', status: 'prospect', scope: 'object' });
  });

  it('buildNewMembership returns null without a scope org', () => {
    expect(buildNewMembership({ ...mod(), scopeOptions: [] })).toBeNull();
  });

  it('applyMembershipPatch keeps id/label consistent with the catalog', () => {
    const item = buildNewMembership(mod())!;
    const patched = applyMembershipPatch(item, { campaignCode: 'adhesion_2026' }, mod());
    expect(patched).toMatchObject({ campaignId: 'c1', campaignLabel: 'Adhésion 2026' });
  });

  it('appendCreatedOption adds a new option once (idempotent by code)', () => {
    const created = { id: 'c2', code: 'charte', label: "Charte d'engagement" };
    const once = appendCreatedOption(mod().campaignOptions, created);
    expect(once).toHaveLength(2);
    expect(appendCreatedOption(once, created)).toHaveLength(2);
  });
});
