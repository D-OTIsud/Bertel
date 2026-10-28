import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../hooks/useExplorerQueries', () => ({
  saveWorkspaceModule: jest.fn(),
  invalidateObjectWorkspaceCaches: jest.fn(),
}));
jest.mock('../../services/moderation', () => ({
  submitPendingChange: jest.fn(),
}));
jest.mock('../../services/write-compatibility', () => ({
  readWriteCompatibility: jest.fn().mockResolvedValue({ compatible: true, clientVersion: 1, minimumClientVersion: 1, serverWriteContractVersion: 1 }),
}));

jest.mock('../../services/notification-delivery', () => ({ pingNotifyDrain: jest.fn() }));

import { planSaveBatch, useEditorSave } from './useEditorSave';
import { saveWorkspaceModule, invalidateObjectWorkspaceCaches } from '../../hooks/useExplorerQueries';
import { submitPendingChange } from '../../services/moderation';
import { pingNotifyDrain } from '../../services/notification-delivery';
import type { ObjectWorkspacePermissions, WorkspaceModuleId } from '../../services/object-workspace';
import { parseObjectWorkspace, type ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { LEGAL_SUMMARY_UNAVAILABLE } from '../../services/object-workspace-safety';
import { readWriteCompatibility } from '../../services/write-compatibility';
import { useSessionStore } from '../../store/session-store';

const mockSaveModule = saveWorkspaceModule as jest.Mock;
const mockInvalidate = invalidateObjectWorkspaceCaches as jest.Mock;
const mockSubmit = submitPendingChange as jest.Mock;
const mockPing = pingNotifyDrain as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

function withCachedEmptyModerationQueue() {
  const client = new QueryClient();
  const queueKey = ['pending-changes', 'pending'] as const;
  client.setQueryData(queueKey, []);
  return {
    client,
    queueKey,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

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
    const plan = planSaveBatch(['contacts', 'location', 'media'], permissions, true, makeModules());
    expect(plan.writable).toEqual(['contacts', 'media']);
    expect(plan.proposals).toEqual([]);
    expect(plan.blocked).toEqual([{ module: 'location', reason: 'Lecture seule' }]);
  });

  it('defaults canWriteCanonicalDirect to true (backward compatible)', () => {
    const permissions = { contacts: perm(true) } as unknown as ObjectWorkspacePermissions;
    const plan = planSaveBatch(['contacts'], permissions, undefined, makeModules());
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
  it('routes every available dirty module to a proposal regardless of permission flags', () => {
    // Permissions are ignored in contributor mode — even modules a canonical writer cannot direct-write.
    const permissions = {} as ObjectWorkspacePermissions;
    const dirty: WorkspaceModuleId[] = ['contacts', 'characteristics', 'tags', 'itinerary', 'location'];
    const plan = planSaveBatch(dirty, permissions, false, makeModules());
    expect(plan.proposals).toEqual(dirty);
    expect(plan.writable).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });
});

function makeModules(): ObjectWorkspaceModules {
  return {
    ...parseObjectWorkspace({ id: 'HOTRUN0000000001', name: 'Test', raw: {} }, ['fr']),
    characteristics: {
      selectedLanguages: [],
      selectedPaymentCodes: ['cash'],
      selectedEnvironmentCodes: [],
      selectedAmenityCodes: ['wifi'],
    },
    contacts: { channels: [] },
  } as unknown as ObjectWorkspaceModules;
}

describe('planSaveBatch — degraded reads are blocked before routing', () => {
  it.each([true, false])('ignores registry-inapplicable modules without masking an itinerary read failure for canonical=%s', (canonical) => {
    const draft = makeModules();
    draft.rooms.unavailableReason = 'Module non applicable au type ITI';
    draft.meetingRooms.unavailableReason = 'Module non applicable au type ITI';
    draft.menus.unavailableReason = 'Module non applicable au type ITI';
    draft.itinerary.unavailableReason = 'Étapes non chargées';
    const plan = planSaveBatch(['rooms', 'meeting-rooms', 'menus', 'itinerary'], {} as ObjectWorkspacePermissions, canonical, draft, draft, ['rooms', 'meeting-rooms', 'menus']);
    expect(plan.writable).toEqual([]);
    expect(plan.proposals).toEqual([]);
    expect(plan.blocked).toEqual([{ module: 'itinerary', reason: 'Étapes non chargées' }]);
  });
  it.each([true, false])('blocks unavailable modules for canonical=%s', (canonical) => {
    const draft = makeModules();
    draft.rooms.unavailableReason = 'Équipements non chargés';
    const permissions = { rooms: perm(true), contacts: perm(true) } as ObjectWorkspacePermissions;
    const plan = planSaveBatch(['rooms', 'contacts'], permissions, canonical, draft);
    expect(plan.blocked).toEqual([{ module: 'rooms', reason: 'Équipements non chargés' }]);
    expect(canonical ? plan.writable : plan.proposals).toEqual(['contacts']);
  });

  it('blocks a restored draft if its baseline still indicates a failed load', () => {
    const baseline = makeModules();
    baseline.menus.unavailableReason = 'Plats non chargés';
    const plan = planSaveBatch(['menus'], {} as ObjectWorkspacePermissions, false, makeModules(), baseline);
    expect(plan.proposals).toEqual([]);
    expect(plan.blocked).toEqual([{ module: 'menus', reason: 'Plats non chargés' }]);
  });

  it('requires the actual module snapshot instead of accepting permission flags alone', () => {
    const plan = planSaveBatch(['rooms'], { rooms: perm(true) } as ObjectWorkspacePermissions);
    expect(plan.writable).toEqual([]);
    expect(plan.blocked[0].reason).toMatch(/pas chargées/);
  });

  it('blocks a malformed module before a contributor can propose it', () => {
    const draft = makeModules();
    draft.rooms.items = null as unknown as typeof draft.rooms.items;
    expect(planSaveBatch(['rooms'], {} as ObjectWorkspacePermissions, false, draft).blocked[0].reason).toMatch(/incomplètes/);
  });

  it('allows readable legal records when only the compliance summary is unavailable', () => {
    const draft = makeModules();
    draft.legal.unavailableReason = LEGAL_SUMMARY_UNAVAILABLE;
    expect(planSaveBatch(['legal'], { legal: perm(true) } as ObjectWorkspacePermissions, true, draft).writable).toEqual(['legal']);
  });
});

describe('useEditorSave.save — fork routing', () => {
  beforeEach(() => {
    mockSaveModule.mockReset().mockResolvedValue(undefined);
    mockInvalidate.mockReset();
    mockSubmit.mockReset().mockResolvedValue('pc-id');
    mockPing.mockReset().mockResolvedValue(undefined);
  });

  it.each([true, false])('never writes or submits a registry-inapplicable module for canonical=%s', async (canonical) => {
    const draft = makeModules();
    draft.rooms.unavailableReason = 'Module non applicable au type ITI';
    const { result } = renderHook(() => useEditorSave('ITI1'), { wrapper });
    let outcome!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      outcome = await result.current.save(['rooms'], {} as ObjectWorkspacePermissions, draft, { canWriteCanonicalDirect: canonical, nonApplicableModules: ['rooms'] });
    });
    expect(outcome).toEqual({ saved: [], submitted: [], failed: [], blocked: [] });
    expect(mockSaveModule).not.toHaveBeenCalled();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('checks compatibility once and prevents every direct/proposal write on an older server', async () => {
    const previousDemoMode = useSessionStore.getState().demoMode;
    useSessionStore.setState({ demoMode: false });
    (readWriteCompatibility as jest.Mock).mockResolvedValueOnce({
      compatible: false,
      clientVersion: 2,
      minimumClientVersion: 1,
      serverWriteContractVersion: 1,
      reason: 'versions incompatibles',
    });
    const { result } = renderHook(() => useEditorSave('HOTRUN0000000001'), { wrapper });
    let outcome!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      outcome = await result.current.save(['contacts'], {} as ObjectWorkspacePermissions, makeModules(), { canWriteCanonicalDirect: false });
    });
    expect(outcome.failed).toEqual([{ module: 'contacts', message: 'versions incompatibles' }]);
    expect(mockSaveModule).not.toHaveBeenCalled();
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockPing).not.toHaveBeenCalled();
    useSessionStore.setState({ demoMode: previousDemoMode });
  });

  it.each([true, false])('never writes or submits a degraded module for canonical=%s', async (canonical) => {
    const draft = makeModules();
    draft.rooms.unavailableReason = 'Lits non chargés';
    const { result } = renderHook(() => useEditorSave('HOTRUN0000000001'), { wrapper });
    let outcome!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      outcome = await result.current.save(['rooms'], { rooms: perm(true) } as ObjectWorkspacePermissions, draft, { canWriteCanonicalDirect: canonical });
    });
    expect(outcome.blocked).toEqual([{ module: 'rooms', reason: 'Lits non chargés' }]);
    expect(mockSaveModule).not.toHaveBeenCalled();
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockPing).not.toHaveBeenCalled();
  });

  it('canonical writer writes directly and never submits a proposal', async () => {
    const permissions = {
      contacts: perm(true),
      characteristics: perm(true),
    } as unknown as ObjectWorkspacePermissions;
    const draft = makeModules();
    const { result } = renderHook(() => useEditorSave('HOTRUN0000000001'), { wrapper });

    let outcome!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      outcome = await result.current.save(['contacts', 'characteristics'], permissions, draft, {
        canWriteCanonicalDirect: true,
      });
    });

    expect(mockSaveModule).toHaveBeenCalledTimes(2);
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockPing).not.toHaveBeenCalled();
    expect(outcome.saved).toEqual(['contacts', 'characteristics']);
    expect(outcome.submitted).toEqual([]);
    // One cache refresh for the whole batch — not one per module.
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
    expect(mockInvalidate.mock.calls[0][1]).toBe('HOTRUN0000000001');
  });

  it('a failed direct write stays in failed; the others still save (parallel partial success)', async () => {
    mockSaveModule.mockImplementation((_objectId: string, input: { moduleId: string }) =>
      input.moduleId === 'contacts' ? Promise.reject(new Error('réseau')) : Promise.resolve(undefined),
    );
    const permissions = {
      contacts: perm(true),
      characteristics: perm(true),
    } as unknown as ObjectWorkspacePermissions;
    const draft = makeModules();
    const { result } = renderHook(() => useEditorSave('HOTRUN0000000001'), { wrapper });

    let outcome!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      outcome = await result.current.save(['contacts', 'characteristics'], permissions, draft, {
        canWriteCanonicalDirect: true,
      });
    });

    expect(outcome.saved).toEqual(['characteristics']);
    expect(outcome.failed).toEqual([{ module: 'contacts', message: 'réseau' }]);
    // Something reached the DB — the caches still refresh once.
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  it('contributor submits a proposal per dirty module and never writes directly', async () => {
    const permissions = {} as ObjectWorkspacePermissions;
    const draft = makeModules();
    const baseline = makeModules();
    const queue = withCachedEmptyModerationQueue();
    const { result } = renderHook(() => useEditorSave('HOTRUN0000000001'), { wrapper: queue.wrapper });

    let outcome!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      outcome = await result.current.save(['characteristics', 'contacts'], permissions, draft, {
        canWriteCanonicalDirect: false,
        baseline,
      });
    });

    expect(mockSaveModule).not.toHaveBeenCalled();
    expect(mockSubmit).toHaveBeenCalledTimes(2);
    expect(mockPing).toHaveBeenCalledTimes(1);
    expect(outcome.submitted).toEqual(['characteristics', 'contacts']);
    expect(outcome.saved).toEqual([]);
    // Object rows stay unchanged, but an already-visited empty moderation queue must refresh.
    expect(mockInvalidate).not.toHaveBeenCalled();
    expect(queue.client.getQueryState(queue.queueKey)?.isInvalidated).toBe(true);

    // The auto-dispatch section carries its whitelisted RPC; the manual one carries a null rpc.
    const submittedRpcs = mockSubmit.mock.calls.map((call) => (call[0].metadata as Record<string, unknown>).rpc);
    expect(submittedRpcs).toEqual(['save_object_commercial', null]);
  });

  it('a failed submission stays in failed; the others still submit (partial success)', async () => {
    mockSubmit.mockImplementation((submission: { metadata: { section: string } }) =>
      submission.metadata.section === 'characteristics' ? Promise.reject(new Error('réseau')) : Promise.resolve('pc-ok'),
    );
    const draft = makeModules();
    const queue = withCachedEmptyModerationQueue();
    const { result } = renderHook(() => useEditorSave('HOTRUN0000000001'), { wrapper: queue.wrapper });

    let outcome!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      outcome = await result.current.save(['characteristics', 'contacts'], {} as ObjectWorkspacePermissions, draft, {
        canWriteCanonicalDirect: false,
      });
    });

    expect(outcome.submitted).toEqual(['contacts']);
    expect(outcome.failed).toEqual([{ module: 'characteristics', message: 'réseau' }]);
    expect(queue.client.getQueryState(queue.queueKey)?.isInvalidated).toBe(true);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('keeps the cached moderation queue valid when every proposal submission fails', async () => {
    mockSubmit.mockRejectedValue(new Error('réseau'));
    const queue = withCachedEmptyModerationQueue();
    const { result } = renderHook(() => useEditorSave('HOTRUN0000000001'), { wrapper: queue.wrapper });

    let outcome!: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      outcome = await result.current.save(['characteristics', 'contacts'], {} as ObjectWorkspacePermissions, makeModules(), {
        canWriteCanonicalDirect: false,
      });
    });

    expect(outcome.submitted).toEqual([]);
    expect(outcome.failed).toEqual([
      { module: 'characteristics', message: 'réseau' },
      { module: 'contacts', message: 'réseau' },
    ]);
    expect(queue.client.getQueryState(queue.queueKey)?.isInvalidated).toBe(false);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});


describe('production notification delivery stays asynchronous', () => {
  it('finishes a submitted save without waiting for the email relay', async () => {
    mockSubmit.mockReset().mockResolvedValue('pc-id');
    mockPing.mockReset().mockReturnValue(new Promise<void>(() => {}));
    const { result } = renderHook(() => useEditorSave('HOTRUN0000000001'), { wrapper });
    await act(async () => {
      const outcome = await result.current.save(['contacts'], {} as ObjectWorkspacePermissions, makeModules(), { canWriteCanonicalDirect: false });
      expect(outcome.submitted).toEqual(['contacts']);
    });
    expect(result.current.saving).toBe(false);
    expect(mockPing).toHaveBeenCalledTimes(1);
  });
});
