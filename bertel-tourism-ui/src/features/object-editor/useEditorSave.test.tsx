import { renderHook, act } from '@testing-library/react';

jest.mock('../../hooks/useExplorerQueries', () => ({
  useSaveObjectWorkspaceModuleMutation: jest.fn(),
}));
jest.mock('../../services/moderation', () => ({
  submitPendingChange: jest.fn(),
}));

import { planSaveBatch, useEditorSave } from './useEditorSave';
import { useSaveObjectWorkspaceModuleMutation } from '../../hooks/useExplorerQueries';
import { submitPendingChange } from '../../services/moderation';
import type { ObjectWorkspacePermissions, WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

const mockUseMutation = useSaveObjectWorkspaceModuleMutation as jest.Mock;
const mockSubmit = submitPendingChange as jest.Mock;

function perm(canDirectWrite: boolean, canPrepareProposal = false) {
  return {
    canDirectWrite,
    canPrepareProposal,
    canSubmitProposal: false,
    disabledReason: canDirectWrite ? null : 'Lecture seule',
  };
}

describe('planSaveBatch — canonical writer (default)', () => {
  it('partitions dirty modules into writable and blocked', () => {
    const permissions = {
      contacts: perm(true),
      location: perm(false),
      media: perm(false, true),
    } as unknown as ObjectWorkspacePermissions;
    const plan = planSaveBatch(['contacts', 'location', 'media'], permissions, true);
    expect(plan.writable).toEqual(['contacts', 'media']);
    expect(plan.proposals).toEqual([]);
    expect(plan.blocked).toEqual([{ module: 'location', reason: 'Lecture seule' }]);
  });

  it('defaults canWriteCanonicalDirect to true (backward compatible)', () => {
    const permissions = { contacts: perm(true) } as unknown as ObjectWorkspacePermissions;
    const plan = planSaveBatch(['contacts'], permissions);
    expect(plan.writable).toEqual(['contacts']);
    expect(plan.proposals).toEqual([]);
  });

  it('returns an empty plan when nothing is dirty', () => {
    const plan = planSaveBatch([], {} as ObjectWorkspacePermissions, true);
    expect(plan.writable).toEqual([]);
    expect(plan.proposals).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });
});

describe('planSaveBatch — contributor (no direct canonical write)', () => {
  it('routes EVERY dirty module to a proposal, nothing blocked (Option B, 22 sections)', () => {
    // Permissions are ignored in contributor mode — even modules a canonical writer cannot direct-write.
    const permissions = {} as ObjectWorkspacePermissions;
    const dirty: WorkspaceModuleId[] = ['contacts', 'characteristics', 'tags', 'itinerary', 'location'];
    const plan = planSaveBatch(dirty, permissions, false);
    expect(plan.proposals).toEqual(dirty);
    expect(plan.writable).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });
});

function makeModules(): ObjectWorkspaceModules {
  return {
    characteristics: {
      selectedLanguages: [],
      selectedPaymentCodes: ['cash'],
      selectedEnvironmentCodes: [],
      selectedAmenityCodes: ['wifi'],
    },
    contacts: { channels: [] },
  } as unknown as ObjectWorkspaceModules;
}

describe('useEditorSave.save — fork routing', () => {
  const mutateAsync = jest.fn();
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue(undefined);
    mockSubmit.mockReset().mockResolvedValue('pc-id');
    mockUseMutation.mockReturnValue({ mutateAsync });
  });

  it('canonical writer writes directly and never submits a proposal', async () => {
    const permissions = {
      contacts: perm(true),
      characteristics: perm(true),
    } as unknown as ObjectWorkspacePermissions;
    const draft = makeModules();
    const { result } = renderHook(() => useEditorSave('HOTRUN0000000001'));

    let outcome!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      outcome = await result.current.save(['contacts', 'characteristics'], permissions, draft, {
        canWriteCanonicalDirect: true,
      });
    });

    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(outcome.saved).toEqual(['contacts', 'characteristics']);
    expect(outcome.submitted).toEqual([]);
  });

  it('contributor submits a proposal per dirty module and never writes directly', async () => {
    const permissions = {} as ObjectWorkspacePermissions;
    const draft = makeModules();
    const baseline = makeModules();
    const { result } = renderHook(() => useEditorSave('HOTRUN0000000001'));

    let outcome!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      outcome = await result.current.save(['characteristics', 'contacts'], permissions, draft, {
        canWriteCanonicalDirect: false,
        baseline,
      });
    });

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(mockSubmit).toHaveBeenCalledTimes(2);
    expect(outcome.submitted).toEqual(['characteristics', 'contacts']);
    expect(outcome.saved).toEqual([]);

    // The auto-dispatch section carries its whitelisted RPC; the manual one carries a null rpc.
    const submittedRpcs = mockSubmit.mock.calls.map((call) => (call[0].metadata as Record<string, unknown>).rpc);
    expect(submittedRpcs).toEqual(['save_object_commercial', null]);
  });

  it('a failed submission stays in failed; the others still submit (partial success)', async () => {
    mockSubmit
      .mockRejectedValueOnce(new Error('réseau'))
      .mockResolvedValueOnce('pc-ok');
    const draft = makeModules();
    const { result } = renderHook(() => useEditorSave('HOTRUN0000000001'));

    let outcome!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      outcome = await result.current.save(['characteristics', 'contacts'], {} as ObjectWorkspacePermissions, draft, {
        canWriteCanonicalDirect: false,
      });
    });

    expect(outcome.submitted).toEqual(['contacts']);
    expect(outcome.failed).toEqual([{ module: 'characteristics', message: 'réseau' }]);
  });
});
