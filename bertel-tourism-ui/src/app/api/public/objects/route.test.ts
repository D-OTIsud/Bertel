/**
 * @jest-environment node
 */
jest.mock('server-only', () => ({}));
jest.mock('@/lib/partner-auth', () => ({ authenticatePartner: jest.fn(), checkPartnerRate: jest.fn(), logPartnerCall: jest.fn() }));
jest.mock('@/lib/public-api', () => ({
  callPublicRpc: jest.fn(),
  publicHeaders: () => ({ 'X-Bertel-Api-Version': '1.0.0' }),
  PUBLIC_API_CONTRACT_VERSION: '1.0.0',
}));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { authenticatePartner, checkPartnerRate } from '@/lib/partner-auth';
import { callPublicRpc } from '@/lib/public-api';

const authMock = authenticatePartner as jest.Mock;
const checkMock = checkPartnerRate as jest.Mock;
const rpcMock = callPublicRpc as jest.Mock;

function req(qs = '') {
  return new NextRequest(`http://localhost/api/public/objects${qs}`, {
    headers: { authorization: 'Bearer bk_live_' + 'a'.repeat(48) },
  });
}

beforeEach(() => {
  authMock.mockReset();
  checkMock.mockReset();
  rpcMock.mockReset();
  authMock.mockResolvedValue({ keyId: 'k1', label: 'P', scopes: [] });
  checkMock.mockResolvedValue({ allowed: true, retryAfter: 0, limit: 120, remaining: 119 });
  rpcMock.mockResolvedValue({ ok: true, status: 200, body: { info: { next_cursor: 'c2' }, data: [{ id: 'X' }] } });
});

describe('GET /api/public/objects', () => {
  it('401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('429 with Retry-After when the partner is rate-limited (RPC not called)', async () => {
    checkMock.mockResolvedValue({ allowed: false, retryAfter: 42 });
    const res = await GET(req());
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('SECURITY: status is always FORCED to published (a partner can never request drafts)', async () => {
    await GET(req('?types=HOT,RES&page_size=10'));
    const [rpcName, params] = rpcMock.mock.calls[0];
    expect(rpcName).toBe('list_object_resources_page_text');
    expect(params.p_status).toEqual(['published']);
    expect(params.p_types).toEqual(['HOT', 'RES']);
    expect(params.p_page_size).toBe(10);
  });

  it('normalizes lowercase type codes to uppercase before the RPC (types=res → RES)', async () => {
    await GET(req('?types=res,hot'));
    expect(rpcMock.mock.calls[0][1].p_types).toEqual(['RES', 'HOT']);
  });

  it('400 bad_request for an unknown type code — RPC never called', async () => {
    const res = await GET(req('?types=XXX'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('bad_request');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('400 bad_request when a valid and an unknown code are mixed (one bad code fails the request)', async () => {
    const res = await GET(req('?types=RES,XXX'));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('clamps page_size into [1,200]', async () => {
    await GET(req('?page_size=9999'));
    expect(rpcMock.mock.calls[0][1].p_page_size).toBe(200);
  });

  it('emits X-RateLimit-Limit and X-RateLimit-Remaining headers (E4)', async () => {
    checkMock.mockResolvedValue({ allowed: true, retryAfter: 0, limit: 120, remaining: 117 });
    const res = await GET(req());
    expect(res.headers.get('X-RateLimit-Limit')).toBe('120');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('117');
  });

  it('wraps the RPC result under the contract envelope (pagination info in meta)', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.meta.contract_version).toBe('1.0.0');
    expect(json.meta.next_cursor).toBe('c2');
    expect(json.data).toEqual([{ id: 'X' }]);
  });

  it('meta = white-list : SEULES contract_version/page_size/total/next_cursor (aucune clé interne RPC)', async () => {
    rpcMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        info: {
          kind: 'list',
          offset: 0,
          schema_version: '3.0',
          render_locale: 'fr',
          render_tz: 'Indian/Reunion',
          render_version: 7,
          language: 'fr',
          language_fallbacks: ['fr'],
          cursor: null,
          page_size: 50,
          total: 200,
          next_cursor: 'c2',
        },
        data: [{ id: 'X' }],
      },
    });
    const res = await GET(req());
    const json = await res.json();
    expect(Object.keys(json.meta).sort()).toEqual(['contract_version', 'next_cursor', 'page_size', 'total']);
    expect(json.meta.page_size).toBe(50);
    expect(json.meta.total).toBe(200);
    // Aucune fuite des clés internes du RPC
    for (const leaked of ['kind', 'offset', 'schema_version', 'render_locale', 'render_tz', 'render_version', 'language', 'language_fallbacks', 'cursor']) {
      expect(json.meta).not.toHaveProperty(leaked);
    }
  });

  it('next_cursor forcé à null sur une dernière page pile pleine (offset+count === total)', async () => {
    // Le RPC émet un curseur non-null alors que la page épuise le total ⇒ pointerait vers une page vide.
    rpcMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        info: { offset: 8, page_size: 2, total: 10, next_cursor: 'c-should-be-dropped' },
        data: [{ id: 'A' }, { id: 'B' }],
      },
    });
    const res = await GET(req('?page_size=2'));
    const json = await res.json();
    expect(json.meta.next_cursor).toBeNull();
    expect(json.meta.total).toBe(10);
  });

  it('?format=datatourisme — ONE batch call for the page, doc merged under item.<profil> (I4c)', async () => {
    const page = { info: { next_cursor: 'c2' }, data: [{ id: 'A1' }, { id: 'B2' }, { id: 'C3' }] };
    const docs = { A1: { '@type': ['PointOfInterest'] }, C3: { '@type': ['PointOfInterest'] } }; // B2 unmapped
    rpcMock.mockImplementation((name: string) =>
      name === 'get_objects_interop_batch'
        ? Promise.resolve({ ok: true, status: 200, body: docs })
        : Promise.resolve({ ok: true, status: 200, body: page }),
    );
    const res = await GET(req('?format=datatourisme'));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('get_objects_interop_batch', {
      p_object_ids: ['A1', 'B2', 'C3'],
      p_profile: 'datatourisme',
    });
    const json = await res.json();
    expect(json.data[0].datatourisme).toEqual(docs.A1);
    expect(json.data[1].datatourisme).toBeUndefined(); // unmapped item: key absent, item intact
    expect(json.data[1].id).toBe('B2');
    expect(json.data[2].datatourisme).toEqual(docs.C3);
    expect(json.meta.next_cursor).toBe('c2'); // pagination untouched
  });

  it('?format=jsonld — the list batch also serves the schema.org profile', async () => {
    rpcMock.mockImplementation((name: string) =>
      name === 'get_objects_interop_batch'
        ? Promise.resolve({ ok: true, status: 200, body: { X: { '@type': 'Hotel' } } })
        : Promise.resolve({ ok: true, status: 200, body: { info: {}, data: [{ id: 'X' }] } }),
    );
    const res = await GET(req('?format=jsonld'));
    const json = await res.json();
    expect(rpcMock).toHaveBeenCalledWith('get_objects_interop_batch', { p_object_ids: ['X'], p_profile: 'jsonld' });
    expect(json.data[0].jsonld).toEqual({ '@type': 'Hotel' });
  });

  it('?format=apidae — degrades to the plain page if the batch fails (fail-open)', async () => {
    rpcMock.mockImplementation((name: string) =>
      name === 'get_objects_interop_batch'
        ? Promise.resolve({ ok: false, status: 502, body: { error: 'upstream_error' } })
        : Promise.resolve({ ok: true, status: 200, body: { info: {}, data: [{ id: 'X' }] } }),
    );
    const res = await GET(req('?format=apidae'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([{ id: 'X' }]); // page intact, no apidae key
  });

  it('?format=<unknown> — ignored: batch RPC never called', async () => {
    const res = await GET(req('?format=xml'));
    expect(res.status).toBe(200);
    expect(rpcMock).not.toHaveBeenCalledWith('get_objects_interop_batch', expect.anything());
    const json = await res.json();
    expect(json.data).toEqual([{ id: 'X' }]);
  });

  it('?format=tourinsoft — empty page: batch RPC not called', async () => {
    rpcMock.mockResolvedValue({ ok: true, status: 200, body: { info: {}, data: [] } });
    const res = await GET(req('?format=tourinsoft'));
    expect(res.status).toBe(200);
    expect(rpcMock).not.toHaveBeenCalledWith('get_objects_interop_batch', expect.anything());
  });

  it('view=full — passe p_view:full et page_size par défaut 25', async () => {
    await GET(req('?view=full'));
    const [rpcName, params] = rpcMock.mock.calls[0];
    expect(rpcName).toBe('list_object_resources_page_text');
    expect(params.p_view).toBe('full');
    expect(params.p_page_size).toBe(25);
  });

  it('view absent — mode carte (p_view:card, défaut 50)', async () => {
    await GET(req());
    const params = rpcMock.mock.calls[0][1];
    expect(params.p_view).toBe('card');
    expect(params.p_page_size).toBe(50);
  });

  it('view=full — page_size plafonné à 100 (pas 200)', async () => {
    await GET(req('?view=full&page_size=9999'));
    expect(rpcMock.mock.calls[0][1].p_page_size).toBe(100);
  });

  it('view=full — retire canonical_description et org_description de CHAQUE item', async () => {
    rpcMock.mockResolvedValue({
      ok: true, status: 200,
      body: { info: {}, data: [
        { id: 'X', name: 'N', canonical_description: { fr: 'brut' }, org_description: { fr: 'brut' } },
      ] },
    });
    const res = await GET(req('?view=full'));
    const json = await res.json();
    expect(json.data[0]).toEqual({ id: 'X', name: 'N' });
    expect(json.data[0]).not.toHaveProperty('canonical_description');
    expect(json.data[0]).not.toHaveProperty('org_description');
  });

  it('mode carte — n\'altère PAS les items (pas de strip appliqué)', async () => {
    rpcMock.mockResolvedValue({
      ok: true, status: 200,
      body: { info: {}, data: [{ id: 'X', canonical_description: { fr: 'gardé-en-carte' } }] },
    });
    const res = await GET(req()); // pas de view
    const json = await res.json();
    expect(json.data[0]).toEqual({ id: 'X', canonical_description: { fr: 'gardé-en-carte' } });
  });

  it('track=gpx avec view=full — passe p_track_format:gpx', async () => {
    await GET(req('?view=full&track=gpx'));
    expect(rpcMock.mock.calls[0][1].p_track_format).toBe('gpx');
  });

  it('track=gpx SANS view=full — ignoré (p_track_format:none en mode carte)', async () => {
    await GET(req('?track=gpx'));
    expect(rpcMock.mock.calls[0][1].p_track_format).toBe('none');
  });

  it('track invalide (view=full) — ignoré (p_track_format:none)', async () => {
    await GET(req('?view=full&track=shp'));
    expect(rpcMock.mock.calls[0][1].p_track_format).toBe('none');
  });
});
