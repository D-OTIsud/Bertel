jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: { getState: () => ({ demoMode: false }) },
}));

import { getApiClient } from '../lib/supabase';
import {
  computeVersionDiff,
  formatChangeType,
  getObjectVersions,
  getObjectVersionSnapshot,
  restoreObjectVersion,
} from './object-versions';

const mockGetApiClient = getApiClient as jest.Mock;

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
    const rpc = jest.fn().mockResolvedValue({
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
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
    await expect(getObjectVersions('PCURUN0000000001')).rejects.toThrow(/historique/i);
  });
});

describe('getObjectVersionSnapshot', () => {
  it('returns the data record from the RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { name: 'X' }, error: null });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
    const snap = await getObjectVersionSnapshot('PCURUN0000000001', 2);
    expect(rpc).toHaveBeenCalledWith('get_object_version_snapshot', {
      p_object_id: 'PCURUN0000000001',
      p_version_number: 2,
    });
    expect(snap).toEqual({ name: 'X' });
  });
});

describe('restoreObjectVersion', () => {
  it('calls the restore RPC and resolves on success', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
    await restoreObjectVersion('PCURUN0000000001', 2);
    expect(rpc).toHaveBeenCalledWith('rpc_restore_object_version', {
      p_object_id: 'PCURUN0000000001',
      p_version_number: 2,
    });
  });

  it('throws a friendly message on RPC error', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
    await expect(restoreObjectVersion('PCURUN0000000001', 2)).rejects.toThrow(/restaur/i);
  });
});
