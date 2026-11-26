jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn() }));

import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import {
  computeVersionDiff,
  formatChangeType,
  getObjectVersions,
  getObjectVersionSnapshot,
  getObjectLifecycleDetails,
  restoreObjectVersion,
} from './object-versions';

const mockGetApiClient = getApiClient as jest.Mock;
const rpcResponse = (response: unknown) => jest.fn().mockReturnValue(Object.assign(Promise.resolve(response), {
  abortSignal: jest.fn().mockReturnThis(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ ...useSessionStore.getInitialState(), demoMode: false,
    status: 'ready', userId: 'synthetic-version-user',
    authAuthority: { userId: 'synthetic-version-user', epoch: 1, hydrated: true } });
});

describe('computeVersionDiff', () => {
  it('lists only the keys that differ, with before/after stringified', () => {
    const diff = computeVersionDiff(
      { name: 'Old', region_code: 'RUN', extra: null },
      { name: 'New', region_code: 'RUN', extra: { a: 1 } },
    );
    const byKey = Object.fromEntries(diff.map((d) => [d.key, d]));
    expect(Object.keys(byKey).sort()).toEqual(['extra', 'name']);
    expect(byKey.name).toEqual({ key: 'name', before: 'Old', after: 'New' });
    expect(byKey.extra.after).toContain('"a":1');
  });

  it('ignores cache/meta columns even when they differ', () => {
    const diff = computeVersionDiff(
      { name: 'A', cached_rating: 1, updated_at: 't1', current_version: 1 },
      { name: 'A', cached_rating: 5, updated_at: 't2', current_version: 2 },
    );
    expect(diff).toEqual([]);
  });

  it('treats a null side as an all-keys add/remove without throwing', () => {
    expect(computeVersionDiff(null, { name: 'X' })).toEqual([
      { key: 'name', before: '', after: 'X' },
    ]);
    expect(computeVersionDiff({ name: 'X' }, null)).toEqual([
      { key: 'name', before: 'X', after: '' },
    ]);
  });
});

describe('formatChangeType', () => {
  it('maps the backend change_type to a French label', () => {
    expect(formatChangeType('insert')).toBe('Création');
    expect(formatChangeType('update')).toBe('Modification');
    expect(formatChangeType('delete')).toBe('Suppression');
    expect(formatChangeType('weird')).toBe('weird');
  });
});

describe('getObjectVersions', () => {
  it('calls the RPC and maps snake_case rows to camelCase', async () => {
    const rpc = rpcResponse({
      data: [
        {
          version_number: 3,
          created_at: '2026-06-17T10:00:00Z',
          created_by_name: 'Alice',
          change_type: 'update',
          change_reason: null,
          changed_fields: ['name'],
        },
      ],
      error: null,
    });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });

    const rows = await getObjectVersions('PCURUN0000000001', 50, 0);
    expect(rpc).toHaveBeenCalledWith('get_object_versions', {
      p_object_id: 'PCURUN0000000001',
      p_limit: 50,
      p_offset: 0,
    });
    expect(rows).toEqual([
      {
        versionNumber: 3,
        createdAt: '2026-06-17T10:00:00Z',
        createdByName: 'Alice',
        changeType: 'update',
        changeReason: '',
        changedFields: ['name'],
      },
    ]);
  });

  it('throws a friendly message on RPC error', async () => {
    const rpc = rpcResponse({ data: null, error: { message: 'boom' } });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
    await expect(getObjectVersions('PCURUN0000000001')).rejects.toThrow(/historique/i);
  });
});

describe('getObjectVersionSnapshot', () => {
  it('returns the data record from the RPC', async () => {
    const rpc = rpcResponse({ data: { name: 'X' }, error: null });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
    const snap = await getObjectVersionSnapshot('PCURUN0000000001', 2);
    expect(rpc).toHaveBeenCalledWith('get_object_version_snapshot', {
      p_object_id: 'PCURUN0000000001',
      p_version_number: 2,
    });
    expect(snap).toEqual({ name: 'X' });
  });
});

describe('getObjectLifecycleDetails', () => {
  const objectId = 'PCURUN0000000001';
  function useRpc(rpc: jest.Mock) {
    const request = (...args: unknown[]) => Object.assign(Promise.resolve(rpc(...args)), {
      abortSignal: jest.fn().mockReturnThis(),
    });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc: request }) });
  }
  const transitionRow = (versionNumber: number, createdByName = 'Alice') => ({
    version_number: versionNumber,
    created_at: '2026-11-26T10:00:00Z',
    created_by_name: createdByName,
    change_reason: `Reason for version ${versionNumber}`,
    change_type: 'update',
    changed_fields: ['status'],
  });

  it('returns the most recent archive author after multiple archive and restore episodes, ignoring later edits', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({
        data: [
          { ...transitionRow(8, 'Later editor'), changed_fields: ['name'] },
          transitionRow(7, 'Latest archiver'),
          transitionRow(6, 'Restorer'),
          transitionRow(4, 'First archiver'),
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: { status: 'archived' }, error: null });
    useRpc(rpc);

    await expect(getObjectLifecycleDetails(objectId, 'archived')).resolves.toEqual({
      createdAt: '2026-11-26T10:00:00Z',
      createdByName: 'Latest archiver',
      changeReason: 'Reason for version 7',
    });
    expect(rpc).toHaveBeenLastCalledWith('get_object_version_snapshot', {
      p_object_id: objectId,
      p_version_number: 7,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('continues beyond 50 later edits to find the archive transition', async () => {
    const laterEdits = Array.from({ length: 50 }, (_, index) => ({
      ...transitionRow(100 - index, 'Later editor'),
      changed_fields: ['name'],
    }));
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: laterEdits, error: null })
      .mockResolvedValueOnce({ data: [transitionRow(50)], error: null })
      .mockResolvedValueOnce({ data: { status: 'archived' }, error: null });
    useRpc(rpc);

    await expect(getObjectLifecycleDetails(objectId, 'archived')).resolves.toEqual({
      createdAt: '2026-11-26T10:00:00Z',
      createdByName: 'Alice',
      changeReason: 'Reason for version 50',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'get_object_versions', {
      p_object_id: objectId,
      p_limit: 50,
      p_offset: 50,
    });
    expect(rpc).toHaveBeenLastCalledWith('get_object_version_snapshot', {
      p_object_id: objectId,
      p_version_number: 50,
    });
  });

  it('returns the latest hidden transition with its author, date and justification', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({
        data: [
          { ...transitionRow(6, 'Later editor'), changed_fields: ['name'] },
          transitionRow(5, 'Latest unpublisher'),
          transitionRow(3, 'Previous unpublisher'),
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: { status: 'hidden' }, error: null });
    useRpc(rpc);

    await expect(getObjectLifecycleDetails(objectId, 'hidden')).resolves.toEqual({
      createdAt: '2026-11-26T10:00:00Z',
      createdByName: 'Latest unpublisher',
      changeReason: 'Reason for version 5',
    });
    expect(rpc).toHaveBeenLastCalledWith('get_object_version_snapshot', {
      p_object_id: objectId,
      p_version_number: 5,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('does not reuse a previous hidden episode when a later transition archived the object', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: [transitionRow(5), transitionRow(3)], error: null })
      .mockResolvedValueOnce({ data: { status: 'archived' }, error: null });
    useRpc(rpc);

    await expect(getObjectLifecycleDetails(objectId, 'hidden')).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('does not report a previous archive when the latest status transition restored the object', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: [transitionRow(3, 'Restorer'), transitionRow(2, 'Archiver')], error: null })
      .mockResolvedValueOnce({ data: { status: 'hidden' }, error: null });
    useRpc(rpc);

    await expect(getObjectLifecycleDetails(objectId, 'archived')).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith('get_object_version_snapshot', {
      p_object_id: objectId,
      p_version_number: 3,
    });
  });

  it.each([null, {}])('returns no archive when the latest transition snapshot is unavailable: %p', async (snapshot) => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: [transitionRow(3), transitionRow(2)], error: null })
      .mockResolvedValueOnce({ data: snapshot, error: null });
    useRpc(rpc);

    await expect(getObjectLifecycleDetails(objectId, 'archived')).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('preserves an unnamed archiver for the UI fallback', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: [transitionRow(2, '')], error: null })
      .mockResolvedValueOnce({ data: { status: 'archived' }, error: null });
    useRpc(rpc);

    await expect(getObjectLifecycleDetails(objectId, 'archived')).resolves.toEqual({
      createdAt: '2026-11-26T10:00:00Z',
      createdByName: '',
      changeReason: 'Reason for version 2',
    });
  });

  it.each([
    { scenario: 'empty history', versions: [] },
    { scenario: 'creation only', versions: [{ ...transitionRow(1), change_type: 'insert' }] },
    { scenario: 'edits only', versions: [{ ...transitionRow(2), changed_fields: ['name'] }] },
  ])('returns no archive without a recorded status transition: $scenario', async ({ versions }) => {
    const rpc = jest.fn().mockResolvedValueOnce({ data: versions, error: null });
    useRpc(rpc);

    await expect(getObjectLifecycleDetails(objectId, 'archived')).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('propagates a history failure instead of presenting it as absent attribution', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'Unavailable' } });
    useRpc(rpc);

    await expect(getObjectLifecycleDetails(objectId, 'archived')).rejects.toThrow(/historique/i);
  });

  it('propagates a snapshot failure instead of falling back to an older archive', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: [transitionRow(3), transitionRow(2)], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Unavailable' } });
    useRpc(rpc);

    await expect(getObjectLifecycleDetails(objectId, 'archived')).rejects.toThrow(/version/i);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe('restoreObjectVersion', () => {
  it('calls the restore RPC and resolves on success', async () => {
    const rpc = rpcResponse({ data: null, error: null });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
    await restoreObjectVersion('PCURUN0000000001', 2);
    expect(rpc).toHaveBeenCalledWith('rpc_restore_object_version', {
      p_object_id: 'PCURUN0000000001',
      p_version_number: 2,
    });
  });

  it('throws a friendly message on RPC error', async () => {
    const rpc = rpcResponse({ data: null, error: { message: 'boom' } });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
    await expect(restoreObjectVersion('PCURUN0000000001', 2)).rejects.toThrow(/restaur/i);
  });
});
