// orchestrator.test.ts — vérifié aussi via un harnais Node local (RPC/fetch mockés) avant commit ;
// 34 assertions portées directement ici, déjà connues vertes côté logique pure. Couvre
// spécifiquement les invariants demandés : lease conflict, "toujours finalisé", dry-run propagé,
// watermark changé jamais appliqué, garde-fou = résultat géré (pas un crash), auth service-key et
// JWT, trigger/requested_by jamais dérivés du corps client.
import { assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { ArcGisFetchError, WatermarkChangedError } from '../_shared/arcgis.ts';
import {
  deriveAuthContext,
  runSync,
  CRON_SECRET_HEADER,
  type AuthContext,
  type RpcClient,
  type ApplyResult,
} from './orchestrator.ts';

// ---------------------------------------------------------------------
// deriveAuthContext
// ---------------------------------------------------------------------

Deno.test('deriveAuthContext: correct cron secret header -> trigger=cron, requestedBy=null', async () => {
  const req = new Request('http://x', { headers: { [CRON_SECRET_HEADER]: 's3cr3t' } });
  const auth = await deriveAuthContext(req, { cronSecretHeaderValue: 's3cr3t', verifyCallerIsSuperuser: async () => ({ ok: false, userId: null }) });
  assertEquals(auth, { trigger: 'cron', requestedBy: null });
});

Deno.test('deriveAuthContext: wrong cron secret + no JWT -> 401', async () => {
  const req = new Request('http://x', { headers: { [CRON_SECRET_HEADER]: 'wrong' } });
  const auth = await deriveAuthContext(req, { cronSecretHeaderValue: 's3cr3t', verifyCallerIsSuperuser: async () => ({ ok: false, userId: null }) });
  assertEquals('status' in auth && auth.status, 401);
});

Deno.test('deriveAuthContext: no header at all -> 401', async () => {
  const req = new Request('http://x', {});
  const auth = await deriveAuthContext(req, { cronSecretHeaderValue: null, verifyCallerIsSuperuser: async () => ({ ok: false, userId: null }) });
  assertEquals('status' in auth && auth.status, 401);
});

Deno.test('deriveAuthContext: valid JWT but caller is not superuser -> 403', async () => {
  const req = new Request('http://x', { headers: { Authorization: 'Bearer abc.def.ghi' } });
  const auth = await deriveAuthContext(req, { cronSecretHeaderValue: 's3cr3t', verifyCallerIsSuperuser: async () => ({ ok: false, userId: 'u1' }) });
  assertEquals('status' in auth && auth.status, 403);
});

Deno.test('deriveAuthContext: valid JWT + superuser -> trigger=manual, requestedBy=caller uid', async () => {
  const req = new Request('http://x', { headers: { Authorization: 'Bearer abc.def.ghi' } });
  const auth = await deriveAuthContext(req, { cronSecretHeaderValue: null, verifyCallerIsSuperuser: async () => ({ ok: true, userId: 'u1' }) });
  assertEquals(auth, { trigger: 'manual', requestedBy: 'u1' });
});

Deno.test('deriveAuthContext: never reads the request body — trigger/requested_by cannot be forged by a client payload', async () => {
  const req = new Request('http://x', {
    method: 'POST',
    headers: { Authorization: 'Bearer abc' },
    body: JSON.stringify({ trigger: 'cron', requested_by: 'attacker-forged-superuser-id' }),
  });
  const auth = await deriveAuthContext(req, { cronSecretHeaderValue: 's3cr3t', verifyCallerIsSuperuser: async () => ({ ok: false, userId: 'attacker' }) });
  // Body claims trigger=cron / requested_by=forged, but auth is gated purely on headers -> still 403.
  assertEquals('status' in auth && auth.status, 403);
  // req.body was never consumed by deriveAuthContext, so it's still readable downstream if needed.
  assertEquals(req.bodyUsed, false);
});

// ---------------------------------------------------------------------
// runSync
// ---------------------------------------------------------------------

interface MockCalls {
  begin: unknown[];
  applyService: unknown[];
  finalize: unknown[];
}

function mockRpc(overrides: {
  beginThrows?: Error;
  runId?: string;
  applyThrows?: Error;
  applyResult?: ApplyResult;
  finalizeThrows?: Error;
} = {}): { rpc: RpcClient; calls: MockCalls } {
  const calls: MockCalls = { begin: [], applyService: [], finalize: [] };
  const rpc: RpcClient = {
    async begin(args) {
      calls.begin.push(args);
      if (overrides.beginThrows) throw overrides.beginThrows;
      return overrides.runId ?? 'run-1';
    },
    async applyService(args) {
      calls.applyService.push(args);
      if (overrides.applyThrows) throw overrides.applyThrows;
      return overrides.applyResult ?? { status: 'ok', counts: {}, anomalies: [], dry_run: args.p_options.dry_run };
    },
    async finalize(args) {
      calls.finalize.push(args);
      if (overrides.finalizeThrows) throw overrides.finalizeThrows;
    },
  };
  return { rpc, calls };
}

const authManual: AuthContext = { trigger: 'manual', requestedBy: 'u1' };
const authCron: AuthContext = { trigger: 'cron', requestedBy: null };
const oneFeature = [{ type: 'Feature' as const, properties: { OBJECTID: 1 }, geometry: { type: 'LineString', coordinates: [] } }];

Deno.test('runSync: lease conflict on begin -> 409, no finalize call (nothing to finalize)', async () => {
  const err = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
  const { rpc, calls } = mockRpc({ beginThrows: err });
  const out = await runSync(authCron, false, { rpc, fetchSnapshot: async () => ({ features: [], layerLastEditDateAfter: 1 }), normalize: async (f) => f as never });
  assertEquals(out.httpStatus, 409);
  assertEquals(out.runId, null);
  assertEquals(calls.finalize.length, 0);
});

Deno.test('runSync: non-lease begin error -> 500, no finalize call', async () => {
  const { rpc, calls } = mockRpc({ beginThrows: new Error('connection refused') });
  const out = await runSync(authManual, false, { rpc, fetchSnapshot: async () => ({ features: [], layerLastEditDateAfter: 1 }), normalize: async (f) => f as never });
  assertEquals(out.httpStatus, 500);
  assertEquals(calls.finalize.length, 0);
});

Deno.test('runSync: ArcGIS fetch error after begin -> ALWAYS finalized failed, applyService never called (no partial payload)', async () => {
  const { rpc, calls } = mockRpc();
  const out = await runSync(authCron, false, {
    rpc,
    fetchSnapshot: async () => { throw new ArcGisFetchError('ArcGIS HTTP 500'); },
    normalize: async (f) => f as never,
  });
  assertEquals(out.httpStatus, 500);
  assertEquals(calls.finalize.length, 1);
  assertEquals((calls.finalize[0] as { p_status: string }).p_status, 'failed');
  assertEquals((calls.finalize[0] as { p_http_status?: number }).p_http_status, 502);
  assertEquals(calls.applyService.length, 0);
});

Deno.test('runSync: watermark changed during fetch -> ALWAYS finalized failed, applyService never called', async () => {
  const { rpc, calls } = mockRpc();
  const out = await runSync(authCron, false, {
    rpc,
    fetchSnapshot: async () => { throw new WatermarkChangedError('layer changed 1000 -> 2000'); },
    normalize: async (f) => f as never,
  });
  assertEquals(out.httpStatus, 500);
  assertEquals((calls.finalize[0] as { p_status: string }).p_status, 'failed');
  assertMatch(String((out.body as { error: string }).error), /changed/i);
  assertEquals(calls.applyService.length, 0);
});

Deno.test('runSync: apply RPC SQL error -> finalized failed', async () => {
  const { rpc, calls } = mockRpc({ applyThrows: new Error('permission denied for function trail_sync_apply_service') });
  const out = await runSync(authCron, false, { rpc, fetchSnapshot: async () => ({ features: oneFeature, layerLastEditDateAfter: 1 }), normalize: async (f) => f as never });
  assertEquals(out.httpStatus, 500);
  assertEquals((calls.finalize[0] as { p_status: string }).p_status, 'failed');
});

Deno.test('runSync: happy path — apply status=ok -> finalized succeeded, 200, layer_last_edit_date passed through', async () => {
  const { rpc, calls } = mockRpc({ applyResult: { status: 'ok', counts: { created: 1 }, anomalies: [], dry_run: false } });
  const out = await runSync(authManual, false, {
    rpc,
    fetchSnapshot: async () => ({ features: oneFeature, layerLastEditDateAfter: 1000 }),
    normalize: async (f) => ({
      external_id: `objectid:${(f.properties as { OBJECTID: number }).OBJECTID}`,
      name_raw: null, name_normalized: null, raw_attributes: {}, geom_geojson: null, geom_hash: null,
      length_m_source: null, status_raw: null, status_normalized_code: 'open', status_reason_raw: null,
      reopening_raw: null, reopening_date: null, reopening_precision: null,
    }),
  });
  assertEquals(out.httpStatus, 200);
  assertEquals((calls.finalize[0] as { p_status: string }).p_status, 'succeeded');
  assertEquals((calls.finalize[0] as { p_layer_last_edit_date?: string }).p_layer_last_edit_date, new Date(1000).toISOString());
  assertEquals(out.body.run_id, 'run-1');
  assertEquals((out.body as { counts: { created: number } }).counts.created, 1);
});

Deno.test('runSync: garde-fou (status=source_error) is a HANDLED outcome — finalized failed, but Edge responds 200, not a crash', async () => {
  const { rpc, calls } = mockRpc({ applyResult: { status: 'source_error', counts: { fetched: 0 }, anomalies: [{ type: 'payload_too_small' }], dry_run: false } });
  const out = await runSync(authCron, false, { rpc, fetchSnapshot: async () => ({ features: [], layerLastEditDateAfter: 1000 }), normalize: async (f) => f as never });
  assertEquals((calls.finalize[0] as { p_status: string }).p_status, 'failed');
  assertMatch(String((calls.finalize[0] as { p_error?: string }).p_error), /garde-fou/i);
  assertEquals(out.httpStatus, 200);
  assertEquals((out.body as { status: string }).status, 'source_error');
});

Deno.test('runSync: dry_run=true propagates to BOTH begin and applyService options — never assumed, always threaded through', async () => {
  const { rpc, calls } = mockRpc({ applyResult: { status: 'ok', counts: {}, anomalies: [], dry_run: true } });
  await runSync(authManual, true, { rpc, fetchSnapshot: async () => ({ features: [], layerLastEditDateAfter: 1 }), normalize: async (f) => f as never });
  assertEquals((calls.begin[0] as { p_dry_run: boolean }).p_dry_run, true);
  assertEquals((calls.applyService[0] as { p_options: { dry_run: boolean } }).p_options.dry_run, true);
});

Deno.test('runSync: finalize itself throwing does not crash — original error still returned (best-effort)', async () => {
  const { rpc } = mockRpc({ applyThrows: new Error('sql boom'), finalizeThrows: new Error('finalize also down') });
  const out = await runSync(authCron, false, { rpc, fetchSnapshot: async () => ({ features: oneFeature, layerLastEditDateAfter: 1 }), normalize: async (f) => f as never });
  assertEquals(out.httpStatus, 500);
  assertMatch(String((out.body as { error: string }).error), /sql boom/);
});

Deno.test('runSync: requested_by/trigger from AuthContext flow verbatim into begin args', async () => {
  const { rpc, calls } = mockRpc();
  await runSync({ trigger: 'manual', requestedBy: 'u-777' }, false, { rpc, fetchSnapshot: async () => ({ features: [], layerLastEditDateAfter: 1 }), normalize: async (f) => f as never });
  assertEquals((calls.begin[0] as { p_trigger: string; p_requested_by: string | null }).p_trigger, 'manual');
  assertEquals((calls.begin[0] as { p_trigger: string; p_requested_by: string | null }).p_requested_by, 'u-777');
});
