jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: { getState: jest.fn(() => ({ demoMode: false })) },
}));

import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { getExportActorCapabilities } from './rpc';

const mockGetApiClient = getApiClient as jest.Mock;
const mockGetState = useSessionStore.getState as jest.Mock;

describe('getExportActorCapabilities (§208 R2 — préflight serveur)', () => {
  const rpc = jest.fn();

  beforeEach(() => {
    rpc.mockReset();
    mockGetState.mockReturnValue({ demoMode: false });
    mockGetApiClient.mockReset();
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
  });

  it('renvoie les capacités ouvertes/fermées telles que rendues par le RPC', async () => {
    rpc.mockResolvedValue({ data: { actor_identity_available: true, actor_contacts_available: false }, error: null });
    await expect(getExportActorCapabilities(['a', 'b'])).resolves.toEqual({
      actorIdentityAvailable: true,
      actorContactsAvailable: false,
    });
    expect(rpc).toHaveBeenCalledWith('export_actor_capabilities', { p_object_ids: ['a', 'b'] });
  });

  // Finding 5 (revue tâche 10) — c'est la branche `if (error) return closed;` (rpc.ts:591)
  // qui tirera RÉELLEMENT avant le déploiement de la migration 16t : PostgREST rend un
  // objet `{ error }` (RPC absent = 404/42883 côté PostgREST), il ne rejette pas la
  // promesse. Le seul test d'échec existant (ExportExcelModal.test.tsx) mockait un
  // rejet, ce qui n'exerçait que la branche `catch` — jamais celle-ci.
  it("RPC absent (pré-16t) : PostgREST rend un objet {error} sans rejeter — les capacités reviennent fermées", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function api.export_actor_capabilities does not exist' } });
    await expect(getExportActorCapabilities(['a', 'b'])).resolves.toEqual({
      actorIdentityAvailable: false,
      actorContactsAvailable: false,
    });
  });
});
