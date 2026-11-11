/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./partner-auth', () => ({ admitPartner: jest.fn(), logPartnerCall: jest.fn() }));
jest.mock('./public-api', () => ({
  callPublicRpc: jest.fn(),
  publicHeaders: () => ({ 'X-Bertel-Api-Version': '1.0.0' }),
  PUBLIC_API_CONTRACT_VERSION: '1.0.0',
}));

import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { admitPartner, logPartnerCall } from './partner-auth';
import { callPublicRpc } from './public-api';
import { GET as getConcepts } from '@/app/api/public/thesaurus/releases/[releaseId]/concepts/route';
import { GET as getManifest } from '@/app/api/public/thesaurus/route';
import { GET as getRelease } from '@/app/api/public/thesaurus/releases/[releaseId]/route';
import { THESAURUS_VOCABULARY_LABELS } from './thesaurus-vocabulary-labels';
import productionVocabularyTitles from './__fixtures__/thesaurus-vocabulary-titles-20261110.json';
import historicalVocabularyTitles from './__fixtures__/thesaurus-vocabulary-history-titles-20261110.json';
import { canonicalThesaurusJson, decodeThesaurusCursor, encodeThesaurusCursor,
  handleThesaurusRequest, publicThesaurusConcept, thesaurusJsonLd } from './thesaurus-api';

const admission = admitPartner as jest.Mock;
const rpc = callPublicRpc as jest.Mock;
const audit = logPartnerCall as jest.Mock;
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SNAPSHOT = '0123456789abcdef0123456789abcdef';
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
    as_of: '2026-11-06T12:00:00Z', total: 1, next_after: null, cursor_snapshot: SNAPSHOT, ...extraMeta }, data } };
}

function manifestReq(query = '', headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/public/thesaurus${query}`, {
    headers: { authorization: `Bearer bk_live_${'a'.repeat(48)}`, ...headers },
  });
}

const activityVocabulary = {
  domain: 'activity_type', name: 'Types d’activité', source_kind: 'ref_code',
  require_definition: false, required_languages: ['fr'],
};

function manifest(domains: Record<string, unknown>[] = [activityVocabulary]) {
  return { release_id: 1, previous_release_id: null, as_of: '2026-11-06T12:00:00Z',
    checksum: 'published-snapshot-checksum', total_concepts: 42, domains };
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

it('keeps official-edition cursors and validators separate from prelaunch releases with the same number', async () => {
  const official = { action: 'concepts', releaseId: '1' } as const;
  const oldScope = createHash('sha256').update(canonicalThesaurusJson({
    action: 'concepts', domains: [], status: [], lang: 'fr', query: null, page_size: 1, format: 'json',
  })).digest('hex');
  const oldCursor = encodeThesaurusCursor({ version: 1, release: 1, scope: oldScope, after: ID });
  rpc.mockResolvedValue(response([concept], { next_after: ID }));

  const first = await handleThesaurusRequest(req('?page_size=1'), official);
  const oldEtag = `"${createHash('sha256').update(first.headers.get('content-type')!)
    .update(':').update(await first.text()).digest('hex')}"`;
  const newPage = await handleThesaurusRequest(req('?page_size=1', {
    'if-none-match': oldEtag,
  }), official);
  const newCursor = (await newPage.json()).meta.next_cursor;

  expect(newPage.status).toBe(200);
  expect(newPage.headers.get('X-Bertel-Vocabulary-Release')).toBe('1');
  expect(newPage.headers.get('etag')).not.toBe(oldEtag);
  expect(newCursor).not.toBe(oldCursor);
  expect(newPage.headers.get('etag')).not.toContain(SNAPSHOT);
  expect(rpc).toHaveBeenLastCalledWith('thesaurus_public_edition', expect.objectContaining({
    p_action: 'concepts', p_release_id: 1,
  }));

  const mismatch = await handleThesaurusRequest(req(`?page_size=1&cursor=${oldCursor}`), official);
  expect(mismatch.status).toBe(400);
  await expect(mismatch.json()).resolves.toEqual({ error: 'invalid_cursor' });

  const next = await handleThesaurusRequest(req(`?page_size=1&cursor=${newCursor}`), official);
  expect(next.status).toBe(200);
  expect(rpc).toHaveBeenLastCalledWith('thesaurus_public_edition', expect.objectContaining({
    p_params: expect.objectContaining({ after: ID, cursor_snapshot: SNAPSHOT }),
  }));
});

it('signs deterministic cursors and rejects tampering, another release and another filter scope', () => {
  const data = { version: 1 as const, release: 1, scope: 'scope', after: ID, snapshot: SNAPSHOT };
  const token = encodeThesaurusCursor(data);
  expect(encodeThesaurusCursor(data)).toBe(token);
  expect(decodeThesaurusCursor(token, 1, 'scope')).toEqual({ after: ID, snapshot: SNAPSHOT });
  expect(() => decodeThesaurusCursor(token, 2, 'scope')).toThrow('invalid_cursor');
  expect(() => decodeThesaurusCursor(token, 1, 'different')).toThrow('invalid_cursor');
  expect(() => decodeThesaurusCursor(`${token.slice(0, -2)}XX`, 1, 'scope')).toThrow('invalid_cursor');
  const legacy = encodeThesaurusCursor({ version: 1, release: 1, scope: 'scope', after: ID });
  expect(() => decodeThesaurusCursor(legacy, 1, 'scope')).toThrow('invalid_cursor');
});

it('treats an empty optional cursor secret as unset and uses the server-only fallback', () => {
  const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.THESAURUS_CURSOR_SECRET = '  ';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-only-fallback';
    const cursor = encodeThesaurusCursor({ version: 1, release: 1, scope: 'scope', after: ID, snapshot: SNAPSHOT });
    expect(decodeThesaurusCursor(cursor, 1, 'scope')).toEqual({ after: ID, snapshot: SNAPSHOT });
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
  expect(rpc).toHaveBeenCalledWith('thesaurus_public_edition', {
    p_action: 'concepts', p_release_id: 1, p_params: expect.objectContaining({ after: ID,
      cursor_snapshot: SNAPSHOT, domains: ['taxonomy_hlo', 'taxonomy_hot'] }),
  });
  rpc.mockClear();
  const mismatch = await handleThesaurusRequest(req(`?domains=taxonomy_hlo&lang=fr&page_size=1&cursor=${firstBody.meta.next_cursor}`), { action: 'concepts', releaseId: '1' });
  expect(mismatch.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

it('binds mutable-edition validators to the selected stored snapshot without exposing its key', async () => {
  rpc.mockResolvedValueOnce(response([concept], { cursor_snapshot: SNAPSHOT }))
    .mockResolvedValueOnce(response([concept], { cursor_snapshot: 'fedcba9876543210fedcba9876543210' }));
  const first = await handleThesaurusRequest(req(), { action: 'concepts', releaseId: '1' });
  const firstText = await first.text();
  const second = await handleThesaurusRequest(req(), { action: 'concepts', releaseId: '1' });
  expect(second.headers.get('etag')).not.toBe(first.headers.get('etag'));
  expect(firstText).not.toContain(SNAPSHOT);
  expect(firstText).not.toContain('cursor_snapshot');
});

it('returns a safe invalid_cursor envelope when the selected mutable snapshot changed', async () => {
  const technicalSnapshotId = 'internal-manifest-id=do-not-expose';
  rpc.mockResolvedValueOnce(response([concept], { next_after: ID }));
  const first = await handleThesaurusRequest(req('?page_size=1'), { action: 'concepts', releaseId: '1' });
  const cursor = (await first.json()).meta.next_cursor;
  rpc.mockResolvedValue({ ok: false, status: 400, body: { error: 'invalid_cursor', detail: technicalSnapshotId } });
  const result = await handleThesaurusRequest(req(`?page_size=1&cursor=${encodeURIComponent(cursor)}`), { action: 'concepts', releaseId: '1' });
  expect(result.status).toBe(400);
  const body = await result.json();
  expect(body).toEqual({ error: 'invalid_cursor' });
  expect(JSON.stringify(body)).not.toContain(technicalSnapshotId);
});

it('does not accept a snapshot for a different requested release', async () => {
  rpc.mockResolvedValue(response([concept], { release_id: 2 }));
  expect((await handleThesaurusRequest(req(), { action: 'concepts', releaseId: '1' })).status).toBe(502);
});

it.each([
  ['', 'fr', 'fr', 'Types d’activité'],
  ['?lang=en', 'en', 'en', 'Activity types'],
  ['?lang=EN-us', 'en-US', 'en', 'Activity types'],
  ['?lang=es', 'es', 'fr', 'Types d’activité'],
])('localizes discovery vocabulary titles with explicit language fallback: %s', async (query, requested, effective, name) => {
  rpc.mockResolvedValue(response(manifest()));
  const result = await getManifest(manifestReq(query));
  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body.data.domains).toEqual([{
    ...activityVocabulary, name, name_i18n: { fr: 'Types d’activité', en: 'Activity types' },
    requested_lang: requested, effective_lang: effective, name_metadata_scope: 'reviewed_legacy_dictionary',
  }]);
  expect(rpc).toHaveBeenCalledWith('thesaurus_public_edition', {
    p_action: 'manifest', p_release_id: null, p_params: expect.objectContaining({ lang: requested }),
  });
});

it('localizes embedded and pinned release manifests without altering published snapshots or metadata', async () => {
  const oldVocabulary = { ...activityVocabulary, name: 'Anciennes catégories locales' };
  const oldRelease = manifest([oldVocabulary]);
  const currentRelease = { ...manifest(), release_id: 2, previous_release_id: 1,
    as_of: '2026-11-07T12:00:00Z', checksum: 'current-snapshot-checksum' };
  const snapshot = { ...currentRelease, releases: [currentRelease, oldRelease] };
  const original = structuredClone(snapshot);
  rpc.mockResolvedValue(response(snapshot, { release_id: 2, previous_release_id: 1, as_of: currentRelease.as_of }));
  const result = await getManifest(manifestReq('?lang=en'));
  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body.data.domains[0].name).toBe('Activity types');
  expect(body.data.releases[0].domains[0].name).toBe('Activity types');
  expect(body.data.releases[1].domains[0]).toEqual({
    ...oldVocabulary, name_i18n: { fr: 'Anciennes catégories locales' },
    requested_lang: 'en', effective_lang: 'fr', name_metadata_scope: 'legacy_scalar',
  });
  expect(body.data.releases.map(({ release_id, checksum, as_of }: Record<string, unknown>) => ({ release_id, checksum, as_of })))
    .toEqual([currentRelease, oldRelease].map(({ release_id, checksum, as_of }) => ({ release_id, checksum, as_of })));
  expect(body.data.domains[0].required_languages).toEqual(['fr']);
  expect(body.meta).toMatchObject({ release_id: 2, vocabulary_release: 2, previous_release_id: 1, as_of: currentRelease.as_of });
  expect(snapshot).toEqual(original);

  rpc.mockResolvedValue(response(currentRelease, { release_id: 2, previous_release_id: 1, as_of: currentRelease.as_of }));
  const pinned = await getRelease(manifestReq('?lang=en'), { params: Promise.resolve({ releaseId: '2' }) });
  expect(pinned.status).toBe(200);
  const expectedPinned = { ...body.data.releases[0] };
  delete expectedPinned.is_current;
  expect((await pinned.json()).data).toEqual(expectedPinned);
  expect(rpc).toHaveBeenLastCalledWith('thesaurus_public_edition', {
    p_action: 'release', p_release_id: 2, p_params: expect.objectContaining({ lang: 'en' }),
  });
  expect(snapshot).toEqual(original);
});

it('preserves custom and unknown vocabulary names instead of assigning an unrelated standard translation', async () => {
  const domains = [
    { ...activityVocabulary, name: 'Activités réservées aux groupes' },
    { ...activityVocabulary, domain: 'local_vocabulary', name: 'Catégories du territoire' },
    { ...activityVocabulary, domain: 'constructor', name: 'Autre vocabulaire' },
  ];
  rpc.mockResolvedValue(response(manifest(domains)));
  const result = await getManifest(manifestReq('?lang=en'));
  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body.data.domains).toEqual(domains.map((domain) => ({
    ...domain, name_i18n: { fr: domain.name }, requested_lang: 'en', effective_lang: 'fr', name_metadata_scope: 'legacy_scalar',
  })));
});

it.each([
  ['en-US', 'en-US', 'Outdoor activities'],
  ['en-GB', 'en', 'Local activities'],
  ['de-DE', 'de', 'Lokale Aktivitäten'],
  ['fr', 'fr', 'Types d’activité'],
])('uses published vocabulary translations before catalog translations for %s', async (requested, effective, name) => {
  const name_i18n = { fr: 'Ancien titre à ignorer', en: 'Local activities', 'en-US': 'Outdoor activities', de: 'Lokale Aktivitäten' };
  rpc.mockResolvedValue(response(manifest([{ ...activityVocabulary, name_i18n }])));
  const result = await getManifest(manifestReq(`?lang=${requested}`));
  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body.data.domains[0]).toEqual({
    ...activityVocabulary, name, name_i18n: { ...name_i18n, fr: activityVocabulary.name },
    requested_lang: requested, effective_lang: effective, name_metadata_scope: 'release_snapshot',
  });
});

it('uses published translations for custom titles and ignores empty or invalid translation entries', async () => {
  rpc.mockResolvedValue(response(manifest([
    { ...activityVocabulary, name: 'Activités locales', name_i18n: { en: 'Local activities', es: 7, de: ' ' } },
    { ...activityVocabulary, name_i18n: { en: ' ', es: 7 } },
  ])));
  const result = await getManifest(manifestReq('?lang=en'));
  expect(result.status).toBe(200);
  const { data } = await result.json();
  expect(data.domains[0]).toMatchObject({
    name: 'Local activities', name_i18n: { fr: 'Activités locales', en: 'Local activities' }, effective_lang: 'en',
  });
  expect(data.domains[0].name_i18n).not.toHaveProperty('es');
  expect(data.domains[0].name_i18n).not.toHaveProperty('de');
  expect(data.domains[1]).toMatchObject({ name: 'Activity types', effective_lang: 'en',
    name_i18n: { fr: 'Types d’activité', en: 'Activity types' }, name_metadata_scope: 'reviewed_legacy_dictionary' });
});

it('translates every standard catalog title and raw domain alias on discovery while retaining vocabulary order', async () => {
  const catalog = Object.entries(THESAURUS_VOCABULARY_LABELS);
  expect(catalog).toHaveLength(66);
  const domains = catalog.flatMap(([domain, labels]) => labels.fr.map((name) => ({ ...activityVocabulary, domain, name })));
  const expectedNames = catalog.flatMap(([, labels]) => labels.fr.map(() => labels.en));
  expect(catalog.every(([domain, labels]) => labels.fr.includes(domain) && labels.en.trim() && labels.en !== domain)).toBe(true);
  rpc.mockResolvedValue(response(manifest(domains)));
  const result = await getManifest(manifestReq('?lang=en'));
  expect(result.status).toBe(200);
  const { data } = await result.json();
  expect(data.domains.map((domain: { name: string }) => domain.name)).toEqual(expectedNames);
  expect(data.domains.map((domain: { domain: string }) => domain.domain)).toEqual(domains.map((domain) => domain.domain));
  expect(data.domains.every((domain: { effective_lang: string }) => domain.effective_lang === 'en')).toBe(true);
});

it('translates all vocabulary titles captured independently from production release 25', async () => {
  expect(productionVocabularyTitles).toHaveLength(66);
  rpc.mockResolvedValue(response(manifest(productionVocabularyTitles)));
  const result = await getManifest(manifestReq('?lang=en'));
  expect(result.status).toBe(200);
  const { data } = await result.json();
  expect(data.domains).toHaveLength(66);
  expect(data.domains.map((domain: { domain: string; name_i18n: { fr: string } }) => ({
    domain: domain.domain, name: domain.name_i18n.fr,
  }))).toEqual(productionVocabularyTitles);
  expect(data.domains.every((domain: { requested_lang: string; effective_lang: string }) =>
    domain.requested_lang === 'en' && domain.effective_lang === 'en')).toBe(true);
  expect(data.domains.find((domain: { domain: string }) => domain.domain === 'activity_type').name).toBe('Activity types');
  expect(data.domains.find((domain: { domain: string }) => domain.domain === 'taxonomy_hot').name).toBe('Hotels');
});

it('translates independent historical vocabulary titles in embedded release manifests', async () => {
  expect(historicalVocabularyTitles).toHaveLength(11);
  const historicalRelease = manifest(historicalVocabularyTitles);
  rpc.mockResolvedValue(response({ ...manifest(), releases: [historicalRelease] }));
  const result = await getManifest(manifestReq('?lang=en'));
  expect(result.status).toBe(200);
  const { data } = await result.json();
  const domains = data.releases[0].domains;
  expect(domains).toHaveLength(11);
  expect(domains.map((domain: { domain: string; name_i18n: { fr: string } }) => ({
    domain: domain.domain, name: domain.name_i18n.fr,
  }))).toEqual(historicalVocabularyTitles);
  expect(domains.every((domain: { requested_lang: string; effective_lang: string }) =>
    domain.requested_lang === 'en' && domain.effective_lang === 'en')).toBe(true);
  expect(domains.find((domain: { domain: string }) => domain.domain === 'taxonomy_hot').name).toBe('Hotels');
});

it('keeps discovery ETags specific to the localized representation and honors matching English validators', async () => {
  const snapshot = manifest();
  const original = structuredClone(snapshot);
  rpc.mockResolvedValue(response(snapshot));
  const french = await getManifest(manifestReq());
  const frenchEtag = french.headers.get('etag')!;
  const english = await getManifest(manifestReq('?lang=en', { 'if-none-match': frenchEtag }));
  expect(english.status).toBe(200);
  expect((await english.json()).data.domains[0].name).toBe('Activity types');
  const englishEtag = english.headers.get('etag')!;
  expect(englishEtag).not.toBe(frenchEtag);
  const repeated = await getManifest(manifestReq('?lang=en'));
  expect(repeated.headers.get('etag')).toBe(englishEtag);
  const unchanged = await getManifest(manifestReq('?lang=en', { 'if-none-match': englishEtag }));
  expect(unchanged.status).toBe(304);
  expect(await unchanged.text()).toBe('');
  expect(snapshot).toEqual(original);
});

it('completes a signed HTTP page traversal without duplicates or omissions after the current publication advances', async () => {
  const ids = Array.from({ length: 5 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
  const frozen = ids.map((id, index) => ({ ...concept, concept_id: id,
    uri: concept.uri.replace(ID, id), preferred_labels: { fr: `Terme initial ${index}` } }));
  let currentRelease = 1;
  rpc.mockImplementation(async (_name, input) => {
    if (input.p_action === 'manifest') return response({ current_release_id: currentRelease }, { release_id: currentRelease });
    // The live publication has changed its membership and labels. A pinned old
    // release must still be requested on every continuation, not reconstructed
    // from a changing current vocabulary.
    const rows = input.p_release_id === 1 ? frozen : frozen.slice(1).map((row) => ({ ...row,
      preferred_labels: { fr: 'Nouvelle publication' } }));
    const after = input.p_params.after;
    const start = after ? rows.findIndex((row) => row.concept_id === after) + 1 : 0;
    const page = rows.slice(start, start + input.p_params.page_size);
    return response(page, { release_id: input.p_release_id, total: rows.length,
      next_after: start + page.length < rows.length ? page.at(-1)?.concept_id : null });
  });
  const context = { params: Promise.resolve({ releaseId: '1' }) };
  const first = await getConcepts(req('?page_size=2'), context);
  expect(first.status).toBe(200);
  const firstBody = await first.json();
  currentRelease = 2;
  const manifest = await (await getManifest(new NextRequest('http://localhost/api/public/thesaurus', {
    headers: { authorization: `Bearer bk_live_${'a'.repeat(48)}` },
  }))).json();
  expect(manifest.meta.release_id).toBe(2);
  const collected = [...firstBody.data];
  let cursor = firstBody.meta.next_cursor;
  let pages = 1;
  while (cursor) {
    const next = await getConcepts(req(`?page_size=2&cursor=${encodeURIComponent(cursor)}`), context);
    expect(next.status).toBe(200);
    const body = await next.json();
    expect(body.meta.release_id).toBe(1);
    expect(body.meta.total).toBe(5);
    collected.push(...body.data);
    cursor = body.meta.next_cursor;
    expect(++pages).toBeLessThanOrEqual(3);
  }
  expect(pages).toBe(3);
  expect(collected.map((row) => row.concept_id)).toEqual(ids);
  expect(new Set(collected.map((row) => row.concept_id)).size).toBe(5);
  expect(collected.map((row) => row.name)).toEqual(frozen.map((row) => row.preferred_labels.fr));
  const pageCalls = rpc.mock.calls.filter(([, input]) => input.p_action === 'concepts');
  expect(pageCalls.map(([, input]) => input.p_release_id)).toEqual([1, 1, 1]);
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

it('localizes discovery domains recursively and computes current-release flags from discovery metadata', async () => {
  const manifest = { current_release_id: 2, domains: [
    { domain: 'taxonomy_hlo', name: 'Hébergement', name_i18n: { fr: 'Hébergement', en: 'Accommodation', es: 'Alojamiento', de: 'Unterkunft' } },
    { domain: 'legacy', name: 'Ancien domaine' },
  ], releases: [
    { release_id: 2, is_current: false, domains: [{ domain: 'taxonomy_hlo', name: 'Hébergement', name_i18n: { fr: 'Hébergement', en: 'Accommodation' } }] },
    { release_id: 1, is_current: true, domains: [{ domain: 'taxonomy_hlo', name: 'Nom historique', name_i18n: { fr: 'Nom historique', en: 'Historic name' } }] },
  ] };
  rpc.mockResolvedValue(response(manifest, { release_id: 2, metadata_checksum: 'meta-v2' }));
  const result = await handleThesaurusRequest(new NextRequest('http://localhost/api/public/thesaurus?lang=es', {
    headers: { authorization: `Bearer bk_live_${'a'.repeat(48)}` },
  }), { action: 'manifest' });
  const body = await result.json();
  expect(body.meta.metadata_checksum).toBe('meta-v2');
  expect(body.data.metadata_scope).toBe('release_snapshot');
  expect(body.data.domains[0]).toMatchObject({ name: 'Alojamiento', name_i18n: manifest.domains[0].name_i18n, requested_lang: 'es', effective_lang: 'es' });
  expect(body.data.domains[1]).toMatchObject({ name: 'Ancien domaine', requested_lang: 'es', effective_lang: 'fr' });
  expect(body.data.releases.map((release: any) => release.is_current)).toEqual([true, false]);
  expect(body.data.releases[1].domains[0]).toMatchObject({ name: 'Nom historique', effective_lang: 'fr' });
});

it('uses regional base-language matches, preserves maps, and binds ETags to the localized manifest representation', async () => {
  const manifest = { current_release_id: 2, domains: [{ domain: 'taxonomy_hlo', name: 'Hébergement',
    name_i18n: { fr: 'Hébergement', en: 'Accommodation', es: 'Alojamiento', de: 'Unterkunft' } }], releases: [] };
  rpc.mockResolvedValue(response(manifest, { release_id: 2, metadata_checksum: 'metadata-2' }));
  const call = (lang: string, ifNoneMatch?: string) => handleThesaurusRequest(new NextRequest(`http://localhost/api/public/thesaurus?lang=${lang}`, {
    headers: { authorization: `Bearer bk_live_${'a'.repeat(48)}`, ...(ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {}) },
  }), { action: 'manifest' });
  const fr = await call('fr');
  const en = await call('en');
  const es = await call('es');
  const de = await call('de');
  const regional = await call('en-GB');
  expect((await regional.json()).data.domains[0]).toMatchObject({ name: 'Accommodation', requested_lang: 'en-GB', effective_lang: 'en' });
  const etags = [fr, en, es, de, regional].map((result) => result.headers.get('etag'));
  expect(new Set(etags).size).toBe(5);
  const cached = await call('en', en.headers.get('etag')!);
  expect(cached.status).toBe(304);
  expect(cached.headers.get('etag')).toBe(en.headers.get('etag'));
});

it('localizes a standalone release only from its frozen maps and omits discovery-relative flags', async () => {
  const releaseSnapshot = { release_id: 1, metadata_checksum: 'frozen-meta', is_current: true, domains: [
    { domain: 'taxonomy_hlo', name: 'Nom français gelé', name_i18n: { fr: 'Nom français gelé', en: 'Frozen English' } },
  ] };
  rpc.mockResolvedValue(response(releaseSnapshot, { release_id: 1, metadata_checksum: 'frozen-meta' }));
  const result = await handleThesaurusRequest(new NextRequest('http://localhost/api/public/thesaurus/releases/1?lang=de', {
    headers: { authorization: `Bearer bk_live_${'a'.repeat(48)}` },
  }), { action: 'release', releaseId: '1' });
  const body = await result.json();
  expect(body.meta.metadata_checksum).toBe('frozen-meta');
  expect(body.data.domains[0]).toMatchObject({ name: 'Nom français gelé', requested_lang: 'de', effective_lang: 'fr',
    name_metadata_scope: 'release_snapshot' });
  expect(body.data.domains[0].name_i18n).toEqual(releaseSnapshot.domains[0].name_i18n);
  expect(body.data).not.toHaveProperty('is_current');
});

it.each(['manifest', 'release'] as const)('returns the actual requested domain translation for every supported language on %s', async (action) => {
  const names = { fr: 'Types d’horaires', en: 'Opening schedule types', es: 'Tipos de horario', de: 'Öffnungszeitarten' };
  const historicRules = { require_definition: false, required_languages: ['fr'] };
  for (const lang of Object.keys(names) as Array<keyof typeof names>) {
    rpc.mockResolvedValue(response({ release_id: 1, metadata_checksum: 'frozen', domains: [
      { domain: 'opening_schedule_type', name: names.fr, name_i18n: names, ...historicRules },
    ] }));
    const result = await handleThesaurusRequest(req(`?lang=${lang}`), { action, ...(action === 'release' ? { releaseId: '1' } : {}) });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.data.domains[0]).toMatchObject({ name: names[lang], requested_lang: lang, effective_lang: lang, ...historicRules });
    expect(body.data.domains[0].name_i18n).toEqual(names);
    expect(body.data.metadata_checksum).toBe('frozen');
  }
});

it('uses a reviewed English alias without presenting present-day policy for a legacy release', async () => {
  const legacy = { release_id: 1, domains: [{ domain: 'opening_schedule_type', name: 'Modes d’ouverture', require_definition: false, required_languages: ['fr'] }] };
  rpc.mockResolvedValue(response(legacy));
  const result = await handleThesaurusRequest(req('?lang=en-GB'), { action: 'release', releaseId: '1' });
  const body = await result.json();
  expect(body.meta).not.toHaveProperty('metadata_checksum');
  expect(body.data).not.toHaveProperty('metadata_checksum');
  expect(body.data.domains[0]).toEqual({
    ...legacy.domains[0], name: 'Opening arrangements',
    name_i18n: { fr: 'Modes d’ouverture', en: 'Opening arrangements' }, requested_lang: 'en-GB', effective_lang: 'en',
    name_metadata_scope: 'reviewed_legacy_dictionary',
  });
  expect(legacy.domains[0]).not.toHaveProperty('requested_lang');
});

it.each([
  ['manifest', '?domains=taxonomy_hlo'], ['manifest', '?status=active'],
  ['release', '?domains=taxonomy_hlo'], ['release', '?status=active'],
  ['concept', '?domains=taxonomy_hlo'], ['resolve', '?status=active'],
] as const)('rejects ignored domain/status filters on %s: %s', async (action, query) => {
  const result = await handleThesaurusRequest(new NextRequest(`http://localhost/api/public/thesaurus${query}`, {
    headers: { authorization: `Bearer bk_live_${'a'.repeat(48)}` },
  }), { action, ...(action === 'release' || action === 'concept' ? { releaseId: '1' } : {}), ...(action === 'concept' ? { conceptId: ID } : {}) });
  expect(result.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

it('rejects a revoked key with its previously valid ETag and consumes no snapshot read', async () => {
  const first = await getConcepts(req(), { params: Promise.resolve({ releaseId: '1' }) });
  const etag = first.headers.get('etag')!;
  expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
  admission.mockResolvedValue(null);
  rpc.mockClear();
  const revoked = await getConcepts(req('', { 'if-none-match': etag }), { params: Promise.resolve({ releaseId: '1' }) });
  expect(revoked.status).toBe(401);
  expect(await revoked.json()).toEqual({ error: 'unauthorized' });
  expect(admission).toHaveBeenCalledTimes(2);
  expect(rpc).not.toHaveBeenCalled();
});

it('returns 429 for a newly exhausted quota even with the exact valid ETag', async () => {
  const first = await getConcepts(req(), { params: Promise.resolve({ releaseId: '1' }) });
  const etag = first.headers.get('etag')!;
  admission.mockResolvedValue({ partner: { keyId: 'key' },
    rate: { allowed: false, limit: 120, remaining: 0, retryAfter: 19 } });
  rpc.mockClear();
  const exhausted = await getConcepts(req('', { 'if-none-match': etag }), { params: Promise.resolve({ releaseId: '1' }) });
  expect(exhausted.status).toBe(429);
  expect(exhausted.headers.get('Retry-After')).toBe('19');
  expect(await exhausted.json()).toEqual({ error: 'rate_limited', retry_after: 19 });
  expect(admission).toHaveBeenCalledTimes(2);
  expect(rpc).not.toHaveBeenCalled();
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

const editorialTrace = (type: 'source' | 'history', externalSources?: string) => ({
  lang: 'fr', type,
  value: `Note éditoriale locale (enrichissement 2026-11) : proposition de rédaction et de traduction, non validée par une personne ni par un locuteur natif, qui ne certifie aucun établissement. Concept publié de référence : ${concept.uri}. ${externalSources ? `Sources externes réellement consultées : ${externalSources}.` : 'Aucune source externe consultée pour cette proposition.'}`,
  source: externalSources ? `${concept.uri} ; ${externalSources}` : concept.uri,
});

it.each(['source', 'history'] as const)('keeps %s generation traces internal while preserving business notes and original snapshots', (type) => {
  const businessHistory = { lang: 'fr', type: 'history', value: 'Ancien code remplacé en novembre 2026.', source: 'Décision métier' };
  const externalSource = { lang: 'fr', type: 'source', value: 'Définition du référentiel.', source: 'https://example.org/reference' };
  const input = { ...concept, notes: [...concept.notes, editorialTrace(type), businessHistory, externalSource] };
  const original = JSON.stringify(input);
  expect(publicThesaurusConcept(input).notes).toEqual([...concept.notes, businessHistory, externalSource]);
  expect(JSON.stringify(input)).toBe(original);
});

it('retains actual external citations without the generated editorial disclaimer', () => {
  const source = 'https://www.legislation.gov.uk/eur/2011/1169/annex/II';
  const trace = editorialTrace('history', source);
  const input = { ...concept, notes: [trace] };
  expect(publicThesaurusConcept(input).notes).toEqual([
    { lang: 'fr', type: 'source', value: `Sources externes consultées : ${source}.`, source },
  ]);
  expect(input.notes).toEqual([trace]);
});

it('preserves unmatched editorial text, sources and notes about other concepts', () => {
  const trace = editorialTrace('history');
  const notes = [
    { ...trace, value: `${trace.value} Une réserve métier reste à vérifier.` },
    { ...trace, value: trace.value.replace(concept.uri, concept.uri.replace(ID, OTHER)) },
    { ...trace, source: 'https://example.org/reference' },
    { ...trace, type: 'scope' },
    { ...editorialTrace('history', 'https://example.org/reference'), source: 'Autre provenance' },
  ];
  expect(publicThesaurusConcept({ ...concept, notes }).notes).toEqual(notes);
});

it.each(['concepts', 'concept', 'resolve', 'export', 'changes'] as const)('omits generation boilerplate on the %s response without changing stored data', async (action) => {
  const snapshot = { ...concept, notes: [...concept.notes, editorialTrace('history')] };
  const data = action === 'changes'
    ? [{ concept_id: ID, change_type: 'modified', before: snapshot, after: snapshot }]
    : action === 'concept' || action === 'resolve' ? snapshot : [snapshot];
  const upstream = response(data);
  const original = JSON.stringify(upstream);
  rpc.mockResolvedValue(upstream);
  const result = await handleThesaurusRequest(req(), {
    action, ...(action !== 'resolve' ? { releaseId: '1' } : {}),
    ...(action === 'concept' || action === 'resolve' ? { conceptId: ID } : {}),
  });
  expect(result.status).toBe(200);
  const body = await result.json();
  const projected = action === 'changes' ? [body.data[0].before, body.data[0].after]
    : Array.isArray(body.data) ? body.data : [body.data];
  for (const item of projected) expect(item.notes).toEqual(concept.notes);
  expect(JSON.stringify(body)).not.toContain('Note éditoriale locale');
  expect(JSON.stringify(upstream)).toBe(original);
});

it('applies the same editorial note projection to the standalone JSON-LD export', async () => {
  const citation = 'https://example.org/reference';
  rpc.mockResolvedValue(response([{ ...concept, notes: [...concept.notes, editorialTrace('source'), editorialTrace('history', citation)] }]));
  const result = await handleThesaurusRequest(req('?format=jsonld'), { action: 'export', releaseId: '1' });
  expect(result.status).toBe(200);
  const document = await result.json();
  const node = document['@graph'][0];
  expect(node.notes).toEqual([...concept.notes,
    { lang: 'fr', type: 'source', value: `Sources externes consultées : ${citation}.`, source: citation },
  ]);
  expect(node['skos:scopeNote']).toEqual([{ '@value': concept.notes[0].value, '@language': 'fr' }]);
  expect(node).not.toHaveProperty('skos:historyNote');
  expect(JSON.stringify(document)).not.toContain('Note éditoriale locale');
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
