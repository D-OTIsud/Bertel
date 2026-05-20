import { planSaveBatch } from './useEditorSave';
import type { ObjectWorkspacePermissions } from '../../services/object-workspace';

function perm(canDirectWrite: boolean, canPrepareProposal = false) {
  return {
    canDirectWrite,
    canPrepareProposal,
    canSubmitProposal: false,
    disabledReason: canDirectWrite ? null : 'Lecture seule',
  };
}

describe('planSaveBatch', () => {
  it('partitions dirty modules into writable and blocked', () => {
    const permissions = {
      contacts: perm(true),
      location: perm(false),
      media: perm(false, true),
    } as unknown as ObjectWorkspacePermissions;
    const plan = planSaveBatch(['contacts', 'location', 'media'], permissions);
    expect(plan.writable).toEqual(['contacts', 'media']);
    expect(plan.blocked).toEqual([{ module: 'location', reason: 'Lecture seule' }]);
  });

  it('returns an empty plan when nothing is dirty', () => {
    const plan = planSaveBatch([], {} as ObjectWorkspacePermissions);
    expect(plan.writable).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });
});
