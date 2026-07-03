import { listOrgs, createOrg, friendlyOrgError } from './orgs';
import { getApiClient } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));

function mockRpc(result: { data?: unknown; error?: unknown }) {
  const rpc = jest.fn().mockResolvedValue(result);
  (getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc }) });
  return rpc;
}

test('listOrgs mappe le payload jsonb en OrgSummary[]', async () => {
  mockRpc({ data: [{ id: 'ORGRUN1', name: 'OTI Test', status: 'published', regionCode: 'RUN', accessScope: 'own_objects_only', memberCount: 3, createdAt: '2026-07-03' }], error: null });
  const rows = await listOrgs();
  expect(rows).toEqual([{ id: 'ORGRUN1', name: 'OTI Test', status: 'published', regionCode: 'RUN', accessScope: 'own_objects_only', memberCount: 3, createdAt: '2026-07-03' }]);
});

test('createOrg appelle rpc_create_org avec les défauts et renvoie l\'id', async () => {
  const rpc = mockRpc({ data: 'ORGRUN2', error: null });
  await expect(createOrg({ name: 'Nouvelle OTI' })).resolves.toBe('ORGRUN2');
  expect(rpc).toHaveBeenCalledWith('rpc_create_org', { p_name: 'Nouvelle OTI', p_region_code: 'RUN', p_access_scope: 'own_objects_only' });
});

test('friendlyOrgError traduit DUPLICATE_ORG', () => {
  expect(friendlyOrgError({ message: 'DUPLICATE_ORG: une organisation…' })).toMatch(/existe déjà/);
});
