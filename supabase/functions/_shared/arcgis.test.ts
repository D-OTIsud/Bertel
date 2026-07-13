// arcgis.test.ts — vérifié aussi via un harnais Node local (fetch mocké) avant commit ; 16
// assertions portées directement ici, déjà connues vertes côté logique pure.
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  fetchJsonWithRetry,
  fetchObjectIds,
  fetchAllFeatures,
  fetchFullSnapshot,
  ArcGisFetchError,
  WatermarkChangedError,
  type ArcGisSource,
} from './arcgis.ts';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: init.status ?? 200, ...init });
}

Deno.test('fetchJsonWithRetry: succeeds on the first try', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return jsonResponse({ ok: true });
  }) as typeof fetch;
  const body = await fetchJsonWithRetry('http://x', { fetchImpl, backoffMs: 1 }) as { ok: boolean };
  assertEquals(calls, 1);
  assertEquals(body.ok, true);
});

Deno.test('fetchJsonWithRetry: retries transient failures then succeeds', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    if (calls < 3) throw new Error('network blip');
    return jsonResponse({ ok: true });
  }) as typeof fetch;
  const body = await fetchJsonWithRetry('http://x', { fetchImpl, backoffMs: 1, retries: 5 }) as { ok: boolean };
  assertEquals(calls, 3);
  assertEquals(body.ok, true);
});

Deno.test('fetchJsonWithRetry: exhausts retries and throws ArcGisFetchError', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    throw new Error('always down');
  }) as typeof fetch;
  await assertRejects(
    () => fetchJsonWithRetry('http://x', { fetchImpl, backoffMs: 1, retries: 2 }),
    ArcGisFetchError,
  );
  assertEquals(calls, 3); // retries + 1 attempts
});

Deno.test('fetchJsonWithRetry: non-2xx HTTP status throws', async () => {
  const fetchImpl = (async () => jsonResponse({ msg: 'nope' }, { status: 500 })) as typeof fetch;
  await assertRejects(
    () => fetchJsonWithRetry('http://x', { fetchImpl, backoffMs: 1, retries: 0 }),
    ArcGisFetchError,
  );
});

Deno.test('fetchJsonWithRetry: ArcGIS soft error envelope (HTTP 200, body.error) throws', async () => {
  const fetchImpl = (async () => jsonResponse({ error: { code: 400, message: 'Invalid query' } })) as typeof fetch;
  await assertRejects(
    () => fetchJsonWithRetry('http://x', { fetchImpl, backoffMs: 1, retries: 0 }),
    ArcGisFetchError,
  );
});

Deno.test('fetchJsonWithRetry: malformed non-JSON response throws', async () => {
  const fetchImpl = (async () => new Response('<html>not json</html>', { status: 200 })) as typeof fetch;
  await assertRejects(
    () => fetchJsonWithRetry('http://x', { fetchImpl, backoffMs: 1, retries: 0 }),
    ArcGisFetchError,
  );
});

Deno.test('fetchJsonWithRetry: timeout aborts the request and throws', async () => {
  const fetchImpl = ((_url: string, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => resolve(jsonResponse({ ok: true })), 200);
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      });
    })) as typeof fetch;
  await assertRejects(
    () => fetchJsonWithRetry('http://x', { fetchImpl, backoffMs: 1, retries: 0, timeoutMs: 20 }),
    ArcGisFetchError,
  );
});

Deno.test('fetchObjectIds: sorts unsorted ArcGIS response ascending (service does NOT sort them)', async () => {
  const fetchImpl = (async () => jsonResponse({ objectIdFieldName: 'OBJECTID', objectIds: [1538, 1544, 1503, 1511] })) as typeof fetch;
  const ids = await fetchObjectIds({ baseUrl: 'http://x', layerId: 5 }, { fetchImpl });
  assertEquals(ids, [1503, 1511, 1538, 1544]);
});

Deno.test('fetchAllFeatures: batches ordered ids across multiple requests and reassembles them', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    const m = /objectIds=([^&]+)/.exec(url)!;
    const ids = m[1].split(',').map(Number);
    return jsonResponse({
      features: ids.map((id) => ({ type: 'Feature', properties: { OBJECTID: id }, geometry: { type: 'LineString', coordinates: [] } })),
    });
  }) as typeof fetch;
  const ids = Array.from({ length: 1250 }, (_, i) => i + 1);
  const feats = await fetchAllFeatures({ baseUrl: 'http://x', layerId: 5 }, ids, 500, { fetchImpl });
  assertEquals(calls.length, 3);
  assertEquals(feats.length, 1250);
  assertEquals(feats[0].properties.OBJECTID, 1);
  assertEquals(feats[1249].properties.OBJECTID, 1250);
});

Deno.test('fetchFullSnapshot: unchanged watermark returns the full assembled snapshot', async () => {
  let metaCalls = 0;
  const fetchImpl = (async (url: string) => {
    if (url.includes('returnIdsOnly')) return jsonResponse({ objectIds: [2, 1] });
    if (url.includes('query?objectIds')) {
      return jsonResponse({
        features: [
          { type: 'Feature', properties: { OBJECTID: 1 }, geometry: { type: 'LineString', coordinates: [] } },
          { type: 'Feature', properties: { OBJECTID: 2 }, geometry: { type: 'LineString', coordinates: [] } },
        ],
      });
    }
    metaCalls++;
    return jsonResponse({ editingInfo: { lastEditDate: 1000 }, maxRecordCount: 2000 });
  }) as typeof fetch;
  const source: ArcGisSource = { baseUrl: 'http://x', layerId: 5 };
  const snap = await fetchFullSnapshot(source, { fetchImpl });
  assertEquals(metaCalls, 2); // before + after
  assertEquals(snap.features.length, 2);
  assertEquals(snap.layerLastEditDateBefore, 1000);
  assertEquals(snap.layerLastEditDateAfter, 1000);
});

Deno.test('fetchFullSnapshot: watermark changed during collection throws WatermarkChangedError, never returns partial data', async () => {
  let metaCalls = 0;
  const fetchImpl = (async (url: string) => {
    if (url.includes('returnIdsOnly')) return jsonResponse({ objectIds: [1] });
    if (url.includes('query?objectIds')) {
      return jsonResponse({ features: [{ type: 'Feature', properties: { OBJECTID: 1 }, geometry: { type: 'LineString', coordinates: [] } }] });
    }
    metaCalls++;
    return jsonResponse({ editingInfo: { lastEditDate: metaCalls === 1 ? 1000 : 2000 }, maxRecordCount: 2000 });
  }) as typeof fetch;
  const source: ArcGisSource = { baseUrl: 'http://x', layerId: 5 };
  await assertRejects(() => fetchFullSnapshot(source, { fetchImpl }), WatermarkChangedError);
});
