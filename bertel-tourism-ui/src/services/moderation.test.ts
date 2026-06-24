// Tests du service Modération (P2.1, §119) — RPC-only via api.* DEFINER.
// La table pending_change n'est PAS lisible en PostgREST direct : aucun client.from('pending_change') ici.
jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: { getState: jest.fn(() => ({ demoMode: false })) },
}));

import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import {
  parsePendingChange,
  listPendingChanges,
  submitPendingChange,
  approvePendingChange,
  rejectPendingChange,
} from './moderation';

const mockGetApiClient = getApiClient as jest.Mock;
const mockGetState = useSessionStore.getState as jest.Mock;

const RPC_ROW = {
  id: 'pc-1',
  object_id: 'HOTRUN0000000001',
  object_name: 'Hôtel Basalte',
  target_table: 'object',
  target_pk: 'HOTRUN0000000001',
  action: 'update',
  status: 'pending',
  field_label: 'lieu_dit',
  before_value: 'Bras-Long',
  after_value: 'Bras Long',
  submitted_by: '00000000-0000-4000-a000-000000000001',
  submitter_label: 'Jean Martin',
  submitted_at: '2026-03-12T14:30:00Z',
  reviewed_by: null,
  reviewer_label: null,
  reviewed_at: null,
  review_note: null,
  applied_at: null,
};

describe('parsePendingChange', () => {
  it('maps RPC columns to the PendingChangeItem domain shape', () => {
    const item = parsePendingChange(RPC_ROW);
    expect(item).toMatchObject({
      id: 'pc-1',
      objectId: 'HOTRUN0000000001',
      objectName: 'Hôtel Basalte',
      author: 'Jean Martin',
      field: 'lieu_dit',
      before: 'Bras-Long',
      after: 'Bras Long',
      status: 'pending',
      targetTable: 'object',
      action: 'update',
    });
  });
});

describe('listPendingChanges', () => {
  const rpc = jest.fn();
  beforeEach(() => {
    rpc.mockReset();
    mockGetState.mockReturnValue({ demoMode: false });
    mockGetApiClient.mockReset();
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
  });

  it('calls list_pending_changes with status/object filters and parses rows', async () => {
    rpc.mockResolvedValue({ data: [RPC_ROW], error: null });
    const rows = await listPendingChanges('pending', 'HOTRUN0000000001');
    expect(rpc).toHaveBeenCalledWith('list_pending_changes', {
      p_status: 'pending',
      p_object_id: 'HOTRUN0000000001',
      p_limit: 50,
      p_offset: 0,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('pc-1');
  });

  it('defaults to the pending status and no object filter', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await listPendingChanges();
    expect(rpc).toHaveBeenCalledWith('list_pending_changes', {
      p_status: 'pending',
      p_object_id: null,
      p_limit: 50,
      p_offset: 0,
    });
  });

  it('returns mock data in demo mode without hitting the backend', async () => {
    mockGetState.mockReturnValue({ demoMode: true });
    const rows = await listPendingChanges();
    expect(rpc).not.toHaveBeenCalled();
    expect(rows.length).toBeGreaterThan(0);
  });

  it('surfaces backend errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(listPendingChanges()).rejects.toThrow(/boom|modération/i);
  });
});

describe('submitPendingChange', () => {
  const rpc = jest.fn();
  beforeEach(() => {
    rpc.mockReset();
    mockGetState.mockReturnValue({ demoMode: false });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
  });

  it('calls submit_pending_change with the full envelope and returns the new id', async () => {
    rpc.mockResolvedValue({ data: 'pc-new', error: null });
    const id = await submitPendingChange({
      objectId: 'HOTRUN0000000001',
      targetTable: 'object',
      targetPk: 'HOTRUN0000000001',
      action: 'update',
      payload: { payment_methods: [] },
      metadata: { rpc: 'save_object_commercial', field: 'payment_methods' },
    });
    expect(id).toBe('pc-new');
    expect(rpc).toHaveBeenCalledWith('submit_pending_change', {
      p_object_id: 'HOTRUN0000000001',
      p_target_table: 'object',
      p_target_pk: 'HOTRUN0000000001',
      p_action: 'update',
      p_payload: { payment_methods: [] },
      p_metadata: { rpc: 'save_object_commercial', field: 'payment_methods' },
    });
  });
});

describe('approvePendingChange / rejectPendingChange', () => {
  const rpc = jest.fn();
  beforeEach(() => {
    rpc.mockReset();
    mockGetState.mockReturnValue({ demoMode: false });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
  });

  it('approve calls approve_pending_change with id + note', async () => {
    rpc.mockResolvedValue({ data: { success: true, status: 'applied' }, error: null });
    await approvePendingChange('pc-1', 'OK terrain');
    expect(rpc).toHaveBeenCalledWith('approve_pending_change', { p_id: 'pc-1', p_review_note: 'OK terrain' });
  });

  it('approve surfaces backend errors (e.g. déjà résolu / droits)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Droits de modération insuffisants' } });
    await expect(approvePendingChange('pc-1')).rejects.toThrow(/modération|résolue|approuv/i);
  });

  it('reject requires a non-empty note client-side (never calls the RPC empty)', async () => {
    await expect(rejectPendingChange('pc-1', '   ')).rejects.toThrow(/motif|note/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reject calls reject_pending_change with id + note', async () => {
    rpc.mockResolvedValue({ data: { success: true, status: 'rejected' }, error: null });
    await rejectPendingChange('pc-1', 'Donnée erronée');
    expect(rpc).toHaveBeenCalledWith('reject_pending_change', { p_id: 'pc-1', p_review_note: 'Donnée erronée' });
  });
});
