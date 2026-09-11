jest.mock('../lib/supabase', () => ({
  getApiClient: jest.fn(),
  getSupabaseClient: jest.fn(),
}));
jest.mock('../store/session-store', () => ({
  useSessionStore: {
    getState: jest.fn(() => ({ demoMode: false })),
    subscribe: jest.fn(() => () => {}),
  },
}));

import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { getObjectWorkspacePermissions } from './object-workspace';

const mockGetApiClient = getApiClient as jest.Mock;
const mockSession = useSessionStore.getState as jest.Mock;
const mockRpc = jest.fn();
const mockSchema = jest.fn();
const objectId = 'HLORUN00000001CS';
const verificationError = 'Vos droits de modification n’ont pas pu être vérifiés. Réessayez dans quelques instants.';
const deniedProbes = {
  canonical: false,
  enrichment: false,
  owner: false,
  publish: false,
  private_notes: false,
  crm: false,
  legal: false,
  org_admin: false,
  platform_superuser: false,
};

describe('getObjectWorkspacePermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockReturnValue({ demoMode: false, role: 'tourism_agent', canEditObjects: true });
    mockSchema.mockReturnValue({ rpc: mockRpc });
    mockGetApiClient.mockReturnValue({ schema: mockSchema });
    mockRpc.mockReset().mockResolvedValue({ data: deniedProbes, error: null });
  });

  it('lets an object-authorized editor write and publish with the tourism_agent session role', async () => {
    mockRpc.mockResolvedValue({
      data: { ...deniedProbes, canonical: true, publish: true },
      error: null,
    });

    const permissions = await getObjectWorkspacePermissions(objectId);

    expect(mockSchema).toHaveBeenCalledWith('api');
    expect(mockRpc).toHaveBeenCalledWith('get_object_workspace_permissions', { p_object_id: objectId });
    expect(permissions).toMatchObject({
      generalInfo: { canDirectWrite: true, disabledReason: null },
      contacts: { canDirectWrite: true },
      location: { canDirectWrite: true },
      descriptions: { canEditCanonical: true },
      publication: { canDirectWrite: true, disabledReason: null },
      syncIdentifiers: { canDirectWrite: false },
      delete: { canDirectWrite: false },
    });
  });

  it('preserves contributor permissions when the object response explicitly denies canonical writing', async () => {
    mockRpc.mockResolvedValue({ data: { ...deniedProbes, enrichment: true }, error: null });

    const permissions = await getObjectWorkspacePermissions(objectId);

    expect(permissions.generalInfo).toMatchObject({ canDirectWrite: false, canPrepareProposal: true });
    expect(permissions.descriptions).toMatchObject({ canEditCanonical: false, canEditOrgEnrichment: true });
    expect(permissions.publication.canDirectWrite).toBe(false);
  });

  it('does not grant direct access to an out-of-scope object from the global canEditObjects flag', async () => {
    const permissions = await getObjectWorkspacePermissions(objectId);

    expect(permissions).toMatchObject({
      generalInfo: { canDirectWrite: false, canPrepareProposal: false },
      contacts: { canDirectWrite: false },
      publication: { canDirectWrite: false },
      descriptions: { canEditCanonical: false, canEditOrgEnrichment: false },
      crm: { canDirectWrite: false },
      legal: { canDirectWrite: false },
      syncIdentifiers: { canDirectWrite: false },
      delete: { canDirectWrite: false },
    });
  });

  it.each(['tourism_agent', 'owner', 'super_admin'])('surfaces RPC failure instead of inferring permissions for %s', async (role) => {
    mockSession.mockReturnValue({ demoMode: false, role, canEditObjects: true });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Function unavailable', code: 'PGRST202' } });

    await expect(getObjectWorkspacePermissions(objectId)).rejects.toThrow(verificationError);
  });

  it('surfaces a rejected permission request instead of selecting contributor mode', async () => {
    mockRpc.mockRejectedValue(new Error('Network unavailable'));

    await expect(getObjectWorkspacePermissions(objectId)).rejects.toThrow(verificationError);
  });

  it('requires a client in a live session', async () => {
    mockGetApiClient.mockReturnValue(null);

    await expect(getObjectWorkspacePermissions(objectId)).rejects.toThrow(verificationError);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([null, undefined, [], 'denied', false, 0, {}])('rejects a malformed permission response: %p', async (data) => {
    mockRpc.mockResolvedValue({ data, error: null });

    await expect(getObjectWorkspacePermissions(objectId)).rejects.toThrow(verificationError);
  });

  it.each(Object.keys(deniedProbes))('rejects a response missing the %s boolean', async (key) => {
    const data: Record<string, unknown> = { ...deniedProbes };
    delete data[key];
    mockRpc.mockResolvedValue({ data, error: null });

    await expect(getObjectWorkspacePermissions(objectId)).rejects.toThrow(verificationError);
  });

  it.each(Object.keys(deniedProbes))('rejects a nonboolean %s value', async (key) => {
    mockRpc.mockResolvedValue({ data: { ...deniedProbes, [key]: 'false' }, error: null });

    await expect(getObjectWorkspacePermissions(objectId)).rejects.toThrow(verificationError);
  });

  it('retains the demo bypass without a permission client', async () => {
    mockSession.mockReturnValue({ demoMode: true, role: 'tourism_agent', canEditObjects: true });
    mockGetApiClient.mockReturnValue(null);

    const permissions = await getObjectWorkspacePermissions(objectId);

    expect(permissions.generalInfo.canDirectWrite).toBe(true);
    expect(permissions.publication.canDirectWrite).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
