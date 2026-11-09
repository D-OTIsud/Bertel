/**
 * @jest-environment node
 */
jest.mock('server-only', () => ({}));
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: jest.fn() }));
jest.mock('@/lib/partner-auth', () => ({ authenticatePartner: jest.fn(), checkPartnerRate: jest.fn(), logPartnerCall: jest.fn(), admitPartner: jest.fn() }));
jest.mock('@/lib/partner-selection-store', () => ({ loadPartnerSelection: jest.fn() }));
jest.mock('@/lib/public-api', () => ({
  callPublicRpc: jest.fn(),
  publicHeaders: () => ({ 'X-Bertel-Api-Version': '1.0.0' }),
  PUBLIC_API_CONTRACT_VERSION: '1.0.0',
}));

import { after, NextRequest } from 'next/server';
import { GET } from './route';
import { authenticatePartner, checkPartnerRate, admitPartner, logPartnerCall } from '@/lib/partner-auth';
import { callPublicRpc } from '@/lib/public-api';
import { loadPartnerSelection } from '@/lib/partner-selection-store';
import { getPartnerSelection } from '@/lib/partner-selections';

const authMock = authenticatePartner as jest.Mock;
const checkMock = checkPartnerRate as jest.Mock;
const rpcMock = callPublicRpc as jest.Mock;
const selectionMock = loadPartnerSelection as jest.Mock;

function req(qs = '') {
  return new NextRequest(`http://localhost/api/public/objects${qs}`, {
    headers: { authorization: 'Bearer bk_live_' + 'a'.repeat(48) },
  });
}

beforeAll(() => { jest.spyOn(console, 'info').mockImplementation(() => {}); });
afterAll(() => { jest.restoreAllMocks(); });
beforeEach(() => {
  (after as jest.Mock).mockReset();
  (logPartnerCall as jest.Mock).mockReset();
  (admitPartner as jest.Mock).mockImplementation(async () => {
    const partner = await authMock();
    return partner ? { partner, rate: await checkMock() } : null;
  });
  authMock.mockReset();
  checkMock.mockReset();
  rpcMock.mockReset();
  selectionMock.mockReset().mockImplementation(async (id: string) => getPartnerSelection(id));
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
    expect(rpcName).toBe('list_partner_objects_with_vocabulary');
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

  it('resolves Terroir server-side into two branches before pagination, preserving the public objects envelope', async () => {
    rpcMock.mockResolvedValue({ ok: true, status: 200, body: {
      meta: { page_size: 2, total: 3, next_cursor: 'selection-next', vocabulary_release: 7 },
      data: [{ id: 'PRODUCER', type: 'PRD' }, { id: 'CRAFT', type: 'COM' }],
    } });
    const res = await GET(req('?selection_id=1006&view=full&page_size=2'));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('list_partner_selection_objects_with_vocabulary', expect.objectContaining({
      p_selection_id: '1006', p_partner_key_id: 'k1', p_view: 'full', p_page_size: 2,
      p_definition_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_buckets: [
        { types: ['PRD'] },
        { types: ['COM'], filters: { taxonomy_any: [
          { domain: 'taxonomy_com', code: 'local_crafts' },
          { domain: 'taxonomy_com', code: 'weekly_market' },
          { domain: 'taxonomy_com', code: 'covered_market' },
        ] } },
      ],
      p_commune_insee: ['97403', '97412', '97417', '97422'],
    }));
    expect(await res.json()).toEqual({
      meta: { contract_version: '1.0.0', page_size: 2, total: 3, next_cursor: 'selection-next', vocabulary_release: 7,
        selection_id: '1006', selection_name: 'Terroir et artisanat', selection_revision: 1 },
      data: [{ id: 'PRODUCER', type: 'PRD' }, { id: 'CRAFT', type: 'COM' }],
    });
  });

  it.each(['9999', 'constructor', '__proto__'])('rejects unknown selection %s before object resolution, never returning the global catalogue', async (id) => {
    const res = await GET(req(`?selection_id=${id}`));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('does not fall back to the beta definition when a saved selection is suspended', async () => {
    selectionMock.mockResolvedValue(undefined);
    const res = await GET(req('?selection_id=1006'));
    expect(res.status).toBe(404);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('fails closed when the registry cannot be read', async () => {
    selectionMock.mockRejectedValue(new Error('database unavailable'));
    const res = await GET(req('?selection_id=1006'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'selection_unavailable' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('uses the saved revision and criteria for a permanent selection identifier', async () => {
    selectionMock.mockResolvedValue({
      id: '2000', name: 'Artisans labellisés', revision: 4,
      buckets: [{ types: ['COM'], filters: { label: 'local' } }], communeInsee: null,
    });
    const res = await GET(req('?selection_id=2000'));
    expect(res.status).toBe(200);
    expect(rpcMock.mock.calls[0][1]).toMatchObject({
      p_selection_id: '2000', p_buckets: [{ types: ['COM'], filters: { label: 'local' } }], p_commune_insee: null,
    });
    expect((await res.json()).meta).toMatchObject({ selection_id: '2000', selection_name: 'Artisans labellisés', selection_revision: 4 });
  });

  it('keeps requests without selection independent from the registry', async () => {
    selectionMock.mockRejectedValue(new Error('database unavailable'));
    const res = await GET(req('?types=RES'));
    expect(res.status).toBe(200);
    expect(selectionMock).not.toHaveBeenCalled();
    expect(rpcMock.mock.calls[0][0]).toBe('list_partner_objects_with_vocabulary');
  });

  it.each(['card', 'full'])('keeps the historical RPC, parameters and response identical with absent/false enrichment (%s)', async (view) => {
    selectionMock.mockRejectedValue(new Error('registry unavailable'));
    rpcMock.mockResolvedValue({ ok: true, status: 200, body: {
      meta: { page_size: 2, total: 3, next_cursor: 'legacy-cursor', vocabulary_release: 3 },
      data: [{ id: 'A', type: 'HLO', name: 'Published', apidae: { unchanged: true } }],
    } });
    const query = `?view=${view}&page_size=2&types=HLO&lang=en&search=maison&format=apidae&cursor=legacy-cursor`;
    const baseline = await GET(req(query));
    const baselineCall = rpcMock.mock.calls[0];
    const explicitFalse = await GET(req(`${query}&include_selection_ids=false`));
    expect(rpcMock.mock.calls[1]).toEqual(baselineCall);
    expect(baselineCall[0]).toBe('list_partner_objects_with_vocabulary');
    const body = await baseline.json();
    expect(await explicitFalse.json()).toEqual(body);
    expect(body.data[0]).not.toHaveProperty('selection_ids');
    const stableHeaders = (response: Response) => Object.fromEntries([...response.headers].map(([key, value]) =>
      [key, key === 'server-timing' ? value.replace(/dur=[0-9.]+/g, 'dur=*') : value]));
    expect(stableHeaders(explicitFalse)).toEqual(stableHeaders(baseline));
    expect(selectionMock).not.toHaveBeenCalled();
  });

  it.each(['card', 'full'])('opts into memberships without changing envelope, representations, filters or cursors (%s)', async (view) => {
    const items = [
      { id: 'A', type: 'ITI', selection_ids: ['1001', '1002'], apidae: { id: 'pivot-A' }, canonical_description: 'editor-only' },
      { id: 'B', type: 'ITI', selection_ids: [], apidae: { id: 'pivot-B' } },
    ];
    rpcMock.mockResolvedValue({ ok: true, status: 200, body: {
      info: { page_size: 2, total: 4, next_cursor: 'same-cursor', vocabulary_release: 3, internal: 'hidden' }, data: items,
    } });
    const response = await GET(req(`?include_selection_ids=true&view=${view}&page_size=2&types=ITI&lang=en&format=apidae&cursor=same-cursor`));
    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('list_partner_objects_with_selection_ids', expect.objectContaining({
      p_view: view, p_page_size: 2, p_types: ['ITI'], p_status: ['published'],
      p_lang_prefs: ['en'], p_format: 'apidae', p_cursor: 'same-cursor',
    }));
    const body = await response.json();
    expect(body.meta).toEqual({ contract_version: '1.0.0', page_size: 2, total: 4, next_cursor: 'same-cursor', vocabulary_release: 3 });
    expect(body.data.map((item: { selection_ids: string[] }) => item.selection_ids)).toEqual([['1001', '1002'], []]);
    expect(body.data.map((item: { apidae: unknown }) => item.apidae)).toEqual([{ id: 'pivot-A' }, { id: 'pivot-B' }]);
    if (view === 'full') expect(body.data[0]).not.toHaveProperty('canonical_description');
    expect(selectionMock).not.toHaveBeenCalled();
  });

  it.each([
    'include_selection_ids=', 'include_selection_ids=1', 'include_selection_ids=TRUE',
    'include_selection_ids=true&include_selection_ids=true',
    'include_selection_ids=true&include_selection_ids=false',
    'selection_id=1006&include_selection_ids=true', 'selection_id=1006&include_selection_ids=false',
  ])('rejects ambiguous or unsupported membership options before resolution (%s)', async (query) => {
    const response = await GET(req(`?${query}`));
    expect(response.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(selectionMock).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '1001', [1001], ['__proto__'], ['1001', '1001']])(
    'never turns invalid membership data into a successful empty-membership scan (%p)', async (ids) => {
      rpcMock.mockResolvedValue({ ok: true, status: 200, body: { data: [{ id: 'A', selection_ids: ids }] } });
      const response = await GET(req('?include_selection_ids=true'));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'selection_membership_unavailable' });
      expect(rpcMock).toHaveBeenCalledTimes(1);
      expect(after).toHaveBeenCalledTimes(1);
      await (after as jest.Mock).mock.calls[0][0]();
      expect(logPartnerCall).toHaveBeenCalledTimes(1);
      expect(logPartnerCall).toHaveBeenCalledWith('k1', 'GET /api/public/objects', 503);
    },
  );

  it('does not fall back to the historical reader when membership resolution fails', async () => {
    rpcMock.mockResolvedValue({ ok: false, status: 503, body: { error: 'selection_membership_unavailable' } });
    const response = await GET(req('?include_selection_ids=true'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'selection_membership_unavailable' });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe('list_partner_objects_with_selection_ids');
  });

  it.each([
    'selection_id=', 'selection_id=1006&selection_id=1006',
    'selection_id=1006&types=PRD', 'selection_id=1006&taxonomy=taxonomy_com:local_crafts',
    'selection_id=1006&search=vanille', 'selection_id=1006&include_equivalent_predecessors=true',
    'selection_id=1006&page_size=2&page_size=3', 'selection_id=1006&status=draft',
  ])('rejects ambiguous selection parameters: %s', async (query) => {
    const res = await GET(req(`?${query}`));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('preserves representation options and the selection cursor for the dedicated RPC', async () => {
    await GET(req('?selection_id=1002&view=full&track=gpx&lang=en&format=tourinsoft&variant=reunion-regional-v1&cursor=selection-page-2'));
    expect(rpcMock).toHaveBeenCalledWith('list_partner_selection_objects_with_vocabulary', expect.objectContaining({
      p_cursor: 'selection-page-2', p_track_format: 'gpx', p_lang_prefs: ['en'],
      p_format: 'tourinsoft', p_variant: 'reunion-regional-v1', p_view: 'full',
    }));
  });

  it('returns an empty known selection as a successful empty page', async () => {
    rpcMock.mockResolvedValue({ ok: true, status: 200, body: { meta: { total: 0, next_cursor: null }, data: [] } });
    const res = await GET(req('?selection_id=1012'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.meta).toMatchObject({ selection_id: '1012', total: 0, next_cursor: null });
  });

  it('never falls back to the global catalogue when the selection RPC fails', async () => {
    rpcMock.mockResolvedValue({ ok: false, status: 502, body: { error: 'upstream_error' } });
    const res = await GET(req('?selection_id=1006'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream_error' });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe('list_partner_selection_objects_with_vocabulary');
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

  it('?format=datatourisme — one atomic page RPC preserves attached pivots and unmapped items', async () => {
    const docs = { A1: { '@type': ['PointOfInterest'] }, C3: { '@type': ['PointOfInterest'] } }; // B2 unmapped
    rpcMock.mockResolvedValue({ ok: true, status: 200, body: {
      info: { next_cursor: 'c2', vocabulary_release: 7 },
      data: [{ id: 'A1', datatourisme: docs.A1 }, { id: 'B2' }, { id: 'C3', datatourisme: docs.C3 }],
    } });
    const res = await GET(req('?format=datatourisme'));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('list_partner_objects_with_vocabulary', expect.objectContaining({ p_format: 'datatourisme' }));
    const json = await res.json();
    expect(json.data[0].datatourisme).toEqual(docs.A1);
    expect(json.data[1].datatourisme).toBeUndefined(); // unmapped item: key absent, item intact
    expect(json.data[1].id).toBe('B2');
    expect(json.data[2].datatourisme).toEqual(docs.C3);
    expect(json.meta.next_cursor).toBe('c2'); // pagination untouched
    expect(json.meta.vocabulary_release).toBe(7); // same result as content, never a second version lookup
  });

  it('?format=jsonld — the atomic list RPC also serves the schema.org profile', async () => {
    rpcMock.mockResolvedValue({ ok: true, status: 200, body: { info: {}, data: [{ id: 'X', jsonld: { '@type': 'Hotel' } }] } });
    const res = await GET(req('?format=jsonld'));
    const json = await res.json();
    expect(rpcMock).toHaveBeenCalledWith('list_partner_objects_with_vocabulary', expect.objectContaining({ p_format: 'jsonld' }));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(json.data[0].jsonld).toEqual({ '@type': 'Hotel' });
  });

  it('?format=apidae — preserves a plain page when SQL omits an unavailable optional enrichment', async () => {
    rpcMock.mockResolvedValue({ ok: true, status: 200, body: { info: {}, data: [{ id: 'X' }] } });
    const res = await GET(req('?format=apidae'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([{ id: 'X' }]); // page intact, no apidae key
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('list_partner_objects_with_vocabulary', expect.objectContaining({ p_format: 'apidae' }));
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

  it.each(['reunion-hebergement-v1', 'reunion-regional-v1'] as const)(
    '?format=tourinsoft&variant=%s — forwards the regional variant within one atomic RPC',
    async (variant) => {
      rpcMock.mockResolvedValue({ ok: true, status: 200, body: { info: {}, data: [{ id: 'X', tourinsoft: { SyndicObjectID: 'X' } }] } });
      const res = await GET(req(`?format=tourinsoft&variant=${variant}`));
      expect(res.status).toBe(200);
      expect(rpcMock).toHaveBeenCalledWith('list_partner_objects_with_vocabulary', expect.objectContaining({ p_format: 'tourinsoft', p_variant: variant }));
      expect(rpcMock).toHaveBeenCalledTimes(1);
      expect(rpcMock).not.toHaveBeenCalledWith('get_objects_interop_batch', expect.anything());
      expect((await res.json()).data[0].tourinsoft).toEqual({ SyndicObjectID: 'X' });
    },
  );

  it('?format=tourinsoft&variant=legacy-v1 — forwards the historical variant to SQL', async () => {
    await GET(req('?format=tourinsoft&variant=legacy-v1'));
    expect(rpcMock).toHaveBeenCalledWith('list_partner_objects_with_vocabulary', expect.objectContaining({ p_format: 'tourinsoft', p_variant: 'legacy-v1' }));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).not.toHaveBeenCalledWith('get_objects_tourinsoft_batch', expect.anything());
  });

  it('rejects unknown Tourinsoft variants and variants attached to another format before the list RPC', async () => {
    for (const query of ['?format=tourinsoft&variant=v99', '?format=jsonld&variant=legacy-v1']) {
      const res = await GET(req(query));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('bad_request');
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('view=full — passe p_view:full et page_size par défaut 25', async () => {
    await GET(req('?view=full'));
    const [rpcName, params] = rpcMock.mock.calls[0];
    expect(rpcName).toBe('list_partner_objects_with_vocabulary');
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

  it('normalizes qualified taxonomy codes while keeping predecessor expansion opt-in', async () => {
    await GET(req('?taxonomy=taxonomy_hlo:appartement,taxonomy_hlo:maison,taxonomy_hlo:appartement'));
    expect(rpcMock).toHaveBeenCalledWith('list_partner_objects_with_vocabulary', expect.objectContaining({
      p_taxonomy_codes: ['taxonomy_hlo:appartement', 'taxonomy_hlo:maison'], p_include_equivalent_predecessors: false,
    }));
    rpcMock.mockClear();
    await GET(req('?taxonomy=taxonomy_hlo:appartement&include_equivalent_predecessors=true'));
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_taxonomy_codes: ['taxonomy_hlo:appartement'], p_include_equivalent_predecessors: true });
  });

  it.each(['?taxonomy=appartement', '?taxonomy=crm_sentiment:happy', '?include_equivalent_predecessors=true',
    '?taxonomy=taxonomy_hlo:appartement&include_equivalent_predecessors=yes'])('rejects an invalid taxonomy option: %s', async (query) => {
    expect((await GET(req(query))).status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('omits vocabulary_release before bootstrap and preserves it only from the content snapshot', async () => {
    const before = await (await GET(req())).json();
    expect(before.meta.vocabulary_release).toBeUndefined();
    rpcMock.mockResolvedValue({ ok: true, status: 200, body: { info: { vocabulary_release: 12, private_author: 'secret' }, data: [{ id: 'X', name: 'Version 12' }] } });
    const after = await (await GET(req())).json();
    expect(after.meta.vocabulary_release).toBe(12);
    expect(after.meta.private_author).toBeUndefined();
    expect(after.data[0].name).toBe('Version 12');
  });
});


describe('deferred audit and server measurements', () => {
  it.each([200, 429, 502])('registers one audit before returning %s, executes it only after response', async (status) => {

    checkMock.mockResolvedValue({ allowed: status !== 429, retryAfter: 42, limit: 120, remaining: 0 });
    rpcMock.mockResolvedValue({ ok: status === 200, status, body: { info: {}, data: [{ name: 'Hôtel' }] } });
    const response = await GET(req());
    expect(response.status).toBe(status);
    expect(after).toHaveBeenCalledTimes(1);
    expect(logPartnerCall).not.toHaveBeenCalled();
    const timing = response.headers.get('Server-Timing');
    expect(timing).toMatch(/admission;dur=\d+\.\d{2}/);
    expect(timing).toMatch(/serialization;dur=\d+\.\d{2}/);
    expect(timing).toMatch(/total;dur=\d+\.\d{2}/);
    const text = await response.text();
    const event = (console.info as jest.Mock).mock.calls.at(-1)![0];
    expect(event.bytes).toBe(Buffer.byteLength(text, 'utf8'));
    expect(JSON.stringify(event)).not.toMatch(/bk_live_|Hôtel|k1|localhost/);
    (logPartnerCall as jest.Mock).mockRejectedValueOnce(new Error('audit unavailable'));
    await expect((after as jest.Mock).mock.calls[0][0]()).resolves.toBeUndefined();
    expect(logPartnerCall).toHaveBeenCalledTimes(1);
    expect(logPartnerCall).toHaveBeenCalledWith('k1', 'GET /api/public/objects', status);
    expect(response.status).toBe(status);
    expect(response.headers.get('Server-Timing')).toBe(timing);
  });
});
