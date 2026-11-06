/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./partner-auth', () => ({ admitPartner: jest.fn(), logPartnerCall: jest.fn() }));
jest.mock('./public-api', () => ({
  callPublicRpc: jest.fn(),
  publicHeaders: () => ({ 'X-Bertel-Api-Version': '1.0.0' }),
  PUBLIC_API_CONTRACT_VERSION: '1.0.0',
}));

import { NextRequest } from 'next/server';
import { admitPartner, logPartnerCall } from './partner-auth';
import { callPublicRpc } from './public-api';
import { canonicalThesaurusJson, decodeThesaurusCursor, encodeThesaurusCursor,
  handleThesaurusRequest, publicThesaurusConcept, thesaurusJsonLd } from './thesaurus-api';

const admission = admitPartner as jest.Mock;
const rpc = callPublicRpc as jest.Mock;
const audit = logPartnerCall as jest.Mock;
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const concept = {
  concept_id: ID, uri: `https://bertel.example/api/public/thesaurus/concepts/${ID}`,
  domain: 'taxonomy_hlo', code: 'appartement', context_key: '', name: 'Appartement',
  preferred_labels: { fr: 'Appartement', en: 'Apartment' }, definitions: { fr: 'Logement dans un immeuble.' },
  labels: [{ lang: 'fr', kind: 'alt', value: 'Appart' }],
  notes: [{ lang: 'fr', type: 'scope', value: 'Une unité de logement.', source: 'Guide métier' }],
  broader: [OTHER], narrower: [], related: [], replaced_by: [], relations: [],
  mappings: [{ type: 'closeMatch', target_uri: 'https://example.org/concept/flat', vocabulary: 'Example', source: 'Décision validée' }],
  lifecycle: 'active', assignable: true, valid_from: null, valid_to: null,
};

function req(query = '', headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/public/thesaurus/releases/1/concepts${query}`, {
    headers: { authorization: `Bearer bk_live_${'a'.repeat(48)}`, ...headers },
  });
}
function response(data: unknown = [concept], extraMeta = {}) {
  return { ok: true, status: 200, body: { meta: { release_id: 1, previous_release_id: null,
    as_of: '2026-11-06T12:00:00Z', total: 1, next_after: null, ...extraMeta }, data } };
}

beforeEach(() => {
  process.env.THESAURUS_CURSOR_SECRET = 'test-thesaurus-cursor-secret-not-a-live-key';
  admission.mockReset(); rpc.mockReset(); audit.mockReset();
  admission.mockResolvedValue({ partner: { keyId: 'key', label: 'Partner', scopes: [] },
    rate: { allowed: true, limit: 120, remaining: 119, retryAfter: 0 } });
  audit.mockResolvedValue(undefined);
  rpc.mockResolvedValue(response());
});

it('canonicalizes keys without changing list order', () => {
  expect(canonicalThesaurusJson({ z: 2, a: { y: 1, x: 2 } })).toBe('{"a":{"x":2,"y":1},"z":2}');
  expect(canonicalThesaurusJson([2, 1])).toBe('[2,1]');
});

it('signs deterministic cursors and rejects tampering, another release and another filter scope', () => {
  const data = { version: 1 as const, release: 1, scope: 'scope', after: ID };
  const token = encodeThesaurusCursor(data);
  expect(encodeThesaurusCursor(data)).toBe(token);
  expect(decodeThesaurusCursor(token, 1, 'scope')).toBe(ID);
  expect(() => decodeThesaurusCursor(token, 2, 'scope')).toThrow('invalid_cursor');
  expect(() => decodeThesaurusCursor(token, 1, 'different')).toThrow('invalid_cursor');
  expect(() => decodeThesaurusCursor(`${token.slice(0, -2)}XX`, 1, 'scope')).toThrow('invalid_cursor');
});

it('treats an empty optional cursor secret as unset and uses the server-only fallback', () => {
  const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.THESAURUS_CURSOR_SECRET = '  ';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-only-fallback';
    const cursor = encodeThesaurusCursor({ version: 1, release: 1, scope: 'scope', after: ID });
    expect(decodeThesaurusCursor(cursor, 1, 'scope')).toBe(ID);
    expect(cursor).not.toContain('test-server-only-fallback');
  } finally {
    if (previousServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceKey;
  }
});

it('authenticates before validating input or honoring If-None-Match', async () => {
  admission.mockResolvedValue(null);
  const result = await handleThesaurusRequest(req('?cursor=malformed', { 'if-none-match': '*' }), { action: 'concepts', releaseId: '1' });
  expect(result.status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});

it('enforces quota before loading data or returning 304', async () => {
  admission.mockResolvedValue({ partner: { keyId: 'key' }, rate: { allowed: false, limit: 120, remaining: 0, retryAfter: 23 } });
  const result = await handleThesaurusRequest(req('', { 'if-none-match': '*' }), { action: 'concepts', releaseId: '1' });
  expect(result.status).toBe(429);
  expect(result.headers.get('Retry-After')).toBe('23');
  expect(rpc).not.toHaveBeenCalled();
  expect(audit).toHaveBeenCalledWith('key', expect.any(String), 429);
});

it.each(['?page_size=0', '?page_size=201', '?page_size=1.5', '?page_size=abc', '?lang=not_a_lang',
  '?domains=taxonomy_hlo,', '?domains=private.schema', '?status=unknown', '?page_size=2&page_size=3',
  '?unknown=option', '?cursor='])('rejects malformed boundary parameters: %s', async (query) => {
  const result = await handleThesaurusRequest(req(query), { action: 'concepts', releaseId: '1' });
  expect(result.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

it('normalizes filters and pins every continuation to the same immutable release', async () => {
  rpc.mockResolvedValue(response([concept], { total: 2, next_after: ID }));
  const first = await handleThesaurusRequest(req('?domains=taxonomy_hlo,taxonomy_hot&lang=fr&page_size=1'), { action: 'concepts', releaseId: '1' });
  const firstBody = await first.json();
  expect(firstBody.meta.next_cursor).toEqual(expect.any(String));
  expect(firstBody.meta.vocabulary_release).toBe(1);
  rpc.mockClear();
  await handleThesaurusRequest(req(`?domains=taxonomy_hot,taxonomy_hlo&lang=fr&page_size=1&cursor=${firstBody.meta.next_cursor}`), { action: 'concepts', releaseId: '1' });
  expect(rpc).toHaveBeenCalledWith('thesaurus_public', {
    p_action: 'concepts', p_release_id: 1, p_params: expect.objectContaining({ after: ID, domains: ['taxonomy_hlo', 'taxonomy_hot'] }),
  });
  rpc.mockClear();
  const mismatch = await handleThesaurusRequest(req(`?domains=taxonomy_hlo&lang=fr&page_size=1&cursor=${firstBody.meta.next_cursor}`), { action: 'concepts', releaseId: '1' });
  expect(mismatch.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

it('does not accept a snapshot for a different requested release', async () => {
  rpc.mockResolvedValue(response([concept], { release_id: 2 }));
  expect((await handleThesaurusRequest(req(), { action: 'concepts', releaseId: '1' })).status).toBe(502);
});

it('generates deterministic ETags per representation and a bodyless 304 after fresh admission', async () => {
  const first = await handleThesaurusRequest(req(), { action: 'concepts', releaseId: '1' });
  const etag = first.headers.get('etag')!;
  const repeated = await handleThesaurusRequest(req('', { 'if-none-match': etag }), { action: 'concepts', releaseId: '1' });
  expect(repeated.status).toBe(304);
  expect(await repeated.text()).toBe('');
  expect(repeated.headers.get('cache-control')).toBe('private, no-cache');
  expect(repeated.headers.get('vary')).toBe('Authorization, Accept');
  expect(repeated.headers.get('x-ratelimit-remaining')).toBe('119');
  expect(admission).toHaveBeenCalledTimes(2);
  const english = await handleThesaurusRequest(req('?lang=en'), { action: 'concepts', releaseId: '1' });
  expect(english.headers.get('etag')).not.toBe(etag);
});

it('resolves retired concepts and reports fallback languages without relabeling translations', async () => {
  rpc.mockResolvedValue(response({ ...concept, lifecycle: 'retired', assignable: false }));
  const result = await handleThesaurusRequest(req('?lang=es'), { action: 'resolve', conceptId: ID });
  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body.data.lifecycle).toBe('retired');
  expect(body.data.name).toBe('Appartement');
  expect(body.data.requested_lang).toBe('es');
  expect(body.data.effective_lang).toBe('fr');
  expect(body.data.preferred_labels.es).toBeUndefined();
  expect(rpc.mock.calls[0][1].p_release_id).toBeNull();
});

it('projects public fields without leaking private additions', () => {
  const projected = publicThesaurusConcept({ ...concept, author_email: 'private@example.org',
    source_kind: 'private_table', source_key: { id: 'private-id' }, source_fingerprint: 'private-fingerprint',
    source_fields: { metadata: { aliases: ['private-unreviewed-term'] } }, legacy_search_terms: ['private-legacy-term'],
    labels: [...concept.labels, { lang: 'fr', kind: 'legacy', value: 'Unreviewed', email: 'private' }],
    mappings: [{ ...concept.mappings[0], created_by: 'private' }] });
  expect(JSON.stringify(projected)).not.toContain('private');
  expect(JSON.stringify(projected)).not.toContain('Unreviewed');
  expect(projected).not.toHaveProperty('source_fields');
  expect(projected).not.toHaveProperty('legacy_search_terms');
});

it('preserves opaque scope qualifiers for two concepts sharing a domain and code', async () => {
  rpc.mockResolvedValue(response([
    { ...concept, domain: 'classification_value', code: 'gold', context_key: 'scheme-a' },
    { ...concept, concept_id: OTHER, uri: concept.uri.replace(ID, OTHER), domain: 'classification_value', code: 'gold', context_key: 'scheme-b' },
  ]));
  const json = await (await handleThesaurusRequest(req(), { action: 'concepts', releaseId: '1' })).json();
  expect(json.data).toHaveLength(2);
  expect(json.data.map((item: { context_key: string }) => item.context_key)).toEqual(['scheme-a', 'scheme-b']);
  expect(json.data.map((item: { concept_id: string }) => item.concept_id)).toEqual([ID, OTHER]);
});

it('exports the same labels and relationships as standalone SKOS JSON-LD', async () => {
  rpc.mockResolvedValue(response([concept]));
  const result = await handleThesaurusRequest(req('?format=jsonld'), { action: 'export', releaseId: '1' });
  expect(result.status).toBe(200);
  expect(result.headers.get('content-type')).toContain('application/ld+json');
  const document = await result.json();
  const node = document['@graph'][0];
  expect(node['@id']).toBe(concept.uri);
  expect(node.prefLabel).toEqual(concept.preferred_labels);
  expect(node.context_key).toBe('');
  expect(node.definition).toEqual(concept.definitions);
  expect(node['skos:altLabel']).toEqual([{ '@language': 'fr', '@value': 'Appart' }]);
  expect(node['skos:broader']).toEqual([{ '@id': concept.uri.replace(ID, OTHER) }]);
  expect(node['skos:closeMatch']).toEqual([{ '@id': concept.mappings[0].target_uri }]);
  expect(node['skos:scopeNote']).toEqual([{ '@value': concept.notes[0].value, '@language': 'fr' }]);
  expect(node.prefLabel.es).toBeUndefined();
});

it('rejects an unresolvable relationship URI rather than emitting a different RDF graph', () => {
  expect(() => thesaurusJsonLd([{ ...concept, uri: 'https://example.org/arbitrary' }])).toThrow('invalid_snapshot_relation');
});

it.each([400, 404, 503])('passes only sanitized upstream boundary errors (%s)', async (status) => {
  rpc.mockResolvedValue({ ok: false, status, body: { error: status === 404 ? 'not_found' : 'invalid_parameters' } });
  const result = await handleThesaurusRequest(req(), { action: 'concepts', releaseId: '1' });
  expect(result.status).toBe(status);
});

it('returns 404 for an unknown concept, not for a retired known concept', async () => {
  rpc.mockResolvedValue(response(null));
  expect((await handleThesaurusRequest(req(), { action: 'concept', releaseId: '1', conceptId: ID })).status).toBe(404);
});

it('continues to return a response when audit logging fails', async () => {
  audit.mockRejectedValue(new Error('logging unavailable'));
  expect((await handleThesaurusRequest(req(), { action: 'concepts', releaseId: '1' })).status).toBe(200);
});
