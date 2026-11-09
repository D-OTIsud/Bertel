jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn() }));
import { getApiClient } from '../lib/supabase';
import { createPartnerSelection, updatePartnerSelection, previewPartnerSelection } from './partner-selection-admin';
import { buildDynamicListFilters } from './lists';
import { DEFAULT_EXPLORER_FILTERS } from '../utils/facets';
import type { ExplorerFilters } from '../types/domain';
const call = jest.fn(); const session = jest.fn();
const input = { name: 'Dynamiques', buckets: [{ types: ['RES'], filters: { capacity_filters: [{ code: 'seats', min: 6 }] } }],
  orgObjectId: 'ORG-A', explorerState: { selectedBuckets: ['RES'] }, communeInsee: ['97422'] };
const row = { id: '2000', name: input.name, buckets: input.buckets, org_object_id: 'ORG-A',
  explorer_state: input.explorerState, commune_insee: ['97422'], state: 'active', revision: 2 };
beforeEach(() => {
  call.mockReset(); session.mockReset();
  (getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc: call }), auth: { getSession: session } });
  global.fetch = jest.fn();
});
it('preserves advanced buckets and Explorer state without rebuilding them on rename', async () => {
  call.mockResolvedValue({ data: row, error: null });
  await updatePartnerSelection('2000', 1, input);
  expect(call).toHaveBeenCalledWith('update_partner_selection', expect.objectContaining({
    p_selection_id: '2000', p_expected_revision: 1, p_buckets: input.buckets,
    p_explorer_state: input.explorerState, p_commune_insee: ['97422'],
  }));
});
it('reports optimistic conflicts without silently overwriting a selection', async () => {
  call.mockResolvedValue({ data: null, error: { code: 'PT409' } });
  await expect(createPartnerSelection(input)).rejects.toThrow('Rechargez');
});
it('previews an unsaved draft with the caller Bearer and preserves the returned total/cursor', async () => {
  session.mockResolvedValue({ data: { session: { access_token: 'fixture-session' } }, error: null });
  (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({
    meta: { preview: true, total: 31, next_cursor: 'next', page_size: 25 }, data: [{ id: 'RES-fixture' }],
  }) });
  const result = await previewPartnerSelection(input, { cursor: 'previous' });
  expect(fetch).toHaveBeenCalledWith('/api/partner-selections/preview', expect.objectContaining({
    headers: expect.objectContaining({ authorization: 'Bearer fixture-session' }),
    body: JSON.stringify({ name: input.name, buckets: input.buckets, orgObjectId: 'ORG-A', communeInsee: ['97422'], cursor: 'previous', pageSize: 25 }),
  }));
  expect(result.meta.total).toBe(31); expect(result.meta.next_cursor).toBe('next');
  expect(call).not.toHaveBeenCalled();
});
it('can request one card while retaining the complete volume for the settings list', async () => {
  session.mockResolvedValue({ data: { session: { access_token: 'fixture-session' } }, error: null });
  (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ meta: { preview: true, total: 91, next_cursor: 'count-next', page_size: 1 }, data: [{ id: 'one' }] }) });
  const result = await previewPartnerSelection(input, { pageSize: 1 });
  expect(JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).pageSize).toBe(1);
  expect(result.meta.total).toBe(91);
});
it('does not preview without a session or treat a failed request as an empty selection', async () => {
  session.mockResolvedValue({ data: { session: null }, error: null });
  await expect(previewPartnerSelection(input)).rejects.toThrow('Session');
  expect(fetch).not.toHaveBeenCalled();
  session.mockResolvedValue({ data: { session: { access_token: 'fixture-session' } }, error: null });
  (fetch as jest.Mock).mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: 'preview_unavailable' }) });
  await expect(previewPartnerSelection(input)).rejects.toThrow('Aperçu indisponible');
});

const localDatabase = process.env.PARTNER_SELECTION_LOCAL_TEST_DB;
(localDatabase ? it : it.skip)('accepts the actual complete public Explorer serializer in the local transactional SQL test', async () => {
  // The integration target is deliberately restricted to the owned loopback
  // disposable cluster. No URL, password or production credentials are accepted.
  if (!/^bertel_selection_registry_final_[0-9]{8}$/.test(localDatabase ?? '')) throw new Error('Disposable local database required');
  const filters: ExplorerFilters = JSON.parse(JSON.stringify(DEFAULT_EXPLORER_FILTERS));
  filters.selectedBuckets = ['HOT','RES','ITI','EVT'];
  filters.common.petsAccepted = true;
  filters.common.cities = ['Le Tampon'];
  filters.common.openNow = true;
  filters.common.accessibilityDisabilityTypesAny = ['motor'];
  filters.common.rankedLabelSchemeCode = 'LBL_TOURISME_HANDICAP';
  filters.common.taxonomyAny = [{ domain: 'taxonomy_res', code: 'restaurant' }];
  filters.hot.capacityFilters = [{ code: 'max_capacity', min: 6 }];
  filters.hot.meetingRoom = { minCount: 1, minAreaM2: 20 };
  filters.res.capacityFilters = [{ code: 'seats', min: 6, max: 50 }];
  filters.res.cuisineTypesAny = ['creole'];
  filters.iti.practicesAny = ['randonnee_pedestre'];
  filters.evt.eventFrom = '2026-11-09'; filters.evt.eventTo = '2026-12-31';
  const payload = buildDynamicListFilters(filters);
  const { execFileSync } = await import('node:child_process');
  const path = await import('node:path');
  execFileSync(process.env.PARTNER_SELECTION_TEST_PSQL ?? 'psql', [
    '-h','127.0.0.1','-p','55439','-U','postgres','-d',localDatabase!, '-X','-v','ON_ERROR_STOP=1',
    '-v',`serialized_buckets=${JSON.stringify(payload.buckets)}`,
    '-f',path.resolve(process.cwd(),'../Base de donnée DLL et API/tests/test_partner_selection_registry.sql'),
  ], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], windowsHide: true });
});
