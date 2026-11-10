'use strict';

// Offline contract checks: no Postman account, HTTP client or database connection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/^\uFEFF/, ''));
const collection = readJson('Bertel_API_v3.postman_collection.json');
const environment = readJson('Bertel_API_v3.postman_environment.json');
const openapi = readJson('openapi.json');
const sampleCatalog = readJson('postman-sample-catalog.json');
const graph = JSON.parse(fs.readFileSync(path.join(__dirname, '../db-graph-out/graph.json'), 'utf8'));
const entries = [];
function visit(items, ancestors = []) {
  for (const item of items) {
    if (item.item) visit(item.item, [...ancestors, item]);
    else if (item.request) entries.push({ item, ancestors });
  }
}
visit(collection.item);
const rawUrl = ({ item }) => typeof item.request.url === 'string' ? item.request.url : item.request.url.raw;
const rpcName = (entry) => rawUrl(entry).match(/\/rpc\/([^?/#]+)/)?.[1];
const publicPath = (entry) => rawUrl(entry).split('/api/public')[1]?.split('?')[0];
const scripts = (owner, kind) => (owner.event || []).filter((e) => e.listen === kind).map((e) => e.script.exec.join('\n'));
const legacy = entries.filter(rpcName);
const publicEntries = entries.filter((e) => publicPath(e) !== undefined);
const allowedRpc = new Set([
  'get_object_resource', 'list_object_resources_page', 'list_object_resources_since_fast',
  'list_objects_with_validated_changes_since', 'list_object_resources_filtered_page',
  'list_object_resources_filtered_since_fast', 'get_object_with_deep_data',
  'search_objects_with_deep_data', 'search_objects_by_label', 'list_objects_map_view',
  'search_restaurants_by_cuisine', 'get_media_for_web', 'get_object_reviews',
  'get_object_room_types', 'validate_promotion_code', 'export_itinerary_gpx',
  'export_itineraries_gpx_batch', 'get_itinerary_track_geojson', 'add_legal_record',
  'get_object_legal_data', 'get_object_legal_compliance', 'get_expiring_legal_records_api',
  'request_legal_document', 'get_pending_document_requests_api',
]);
const writeRpc = new Set(['add_legal_record', 'request_legal_document']);
const dynamicKeys = [
  'object_id', 'itinerary_id',
  'public_object_id', 'public_itinerary_id', 'public_next_cursor',
  'tourinsoft_regional_object_id', 'membership_next_cursor', 'selection_next_cursor',
  'thesaurus_release_id', 'thesaurus_previous_release_id', 'thesaurus_concept_id',
  'thesaurus_next_cursor', 'thesaurus_changes_cursor', 'thesaurus_etag',
  'public_deletions_cursor', 'public_taxonomy_code', 'thesaurus_historical_concept_id',
];
const fixtureVariables = {
  public_object_id: 'HLOZZZ0000000001', public_itinerary_id: 'ITIZZZ0000000001',
  object_id: 'HLOFIXTURE', itinerary_id: 'ITIFIXTURE',
  tourinsoft_regional_object_id: 'HLOFIXTURE', public_next_cursor: 'fixture-public-cursor',
  membership_next_cursor: 'fixture-membership-cursor', selection_next_cursor: 'fixture-selection-cursor',
  thesaurus_release_id: '42', thesaurus_previous_release_id: '41',
  thesaurus_concept_id: '00000000-0000-4000-8000-000000000001',
  thesaurus_next_cursor: 'fixture-concepts-cursor', thesaurus_changes_cursor: 'fixture-changes-cursor',
  thesaurus_etag: '"fixture-etag"', legal_record_id: '00000000-0000-4000-8000-000000000002',
  public_deletions_cursor: 'fixture-deletions-cursor', public_taxonomy_code: 'appartement',
  thesaurus_historical_concept_id: '00000000-0000-4000-8000-000000000003',
  legacy_legal_id: '00000000-0000-4000-8000-000000000002',
  legacy_label_value_id: '00000000-0000-4000-8000-000000000004',
  legacy_promotion_code: 'FIXTURE', legacy_legal_type_code: 'ASSURANCE_RC',
  legacy_legal_value: '{"fixture":true}', legacy_legal_valid_from: '2026-01-01',
  legacy_legal_valid_to: '2030-12-31', legacy_requested_at: '2026-11-10T00:00:00Z',
};

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
function routePattern(route) {
  return new RegExp(`^${route.split(/(\{[^}]+\})/).map((part) => part.startsWith('{') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}$`);
}

// Minimal, assertion-backed subset of the Chai chains used by the scripts below.
// Unknown assertions throw instead of silently passing.
function expect(value, negate = false, deep = false) {
  const test = (condition, message) => assert.ok(negate ? !condition : condition, message);
  const methods = {
    equal(other) { test(deep ? require('node:util').isDeepStrictEqual(value, other) : value === other, `expected ${JSON.stringify(value)} ${negate ? 'not ' : ''}to equal ${JSON.stringify(other)}`); return expect(value); },
    eql(other) { return expect(value, negate, true).equal(other); },
    property(key, other) { const exists = value != null && Object.prototype.hasOwnProperty.call(Object(value), key); test(exists, `missing/unexpected property ${key}`); if (arguments.length > 1) expect(value?.[key], negate, deep).equal(other); return expect(value?.[key]); },
    a(type) { test(type === 'array' ? Array.isArray(value) : type === 'null' ? value === null : typeof value === type, `expected ${type}, got ${typeof value}`); return expect(value); },
    include(other) { test(typeof value === 'string' || Array.isArray(value) ? value.includes(other) : Object.keys(other).every((key) => value?.[key] === other[key]), 'include assertion failed'); return expect(value); },
    oneOf(values) { test(values.includes(value), 'oneOf assertion failed'); return expect(value); },
    match(pattern) { test(pattern.test(value), 'match assertion failed'); return expect(value); },
    lengthOf(length) { test(value?.length === length, 'length assertion failed'); return expect(value); },
    above(bound) { test(value > bound, 'above assertion failed'); return expect(value); },
    least(bound) { test(value >= bound, 'least assertion failed'); return expect(value); },
    satisfy(predicate) { test(predicate(value), 'satisfy assertion failed'); return expect(value); },
  };
  return new Proxy({}, { get(_target, key) {
    if (['to', 'be', 'been', 'have', 'has', 'and', 'that', 'which', 'at', 'of'].includes(key)) return expect(value, negate, deep);
    if (key === 'not') return expect(value, !negate, deep);
    if (key === 'deep') return expect(value, negate, true);
    if (key === 'an') return methods.a;
    if (key === 'empty') { test(value != null && (typeof value === 'object' ? Object.keys(value).length : value.length) === 0, 'empty assertion failed'); return expect(value); }
    if (key === 'exist') { test(value !== null && value !== undefined, 'exist assertion failed'); return expect(value); }
    if (['true', 'false', 'null', 'undefined', 'ok'].includes(key)) { test(key === 'ok' ? Boolean(value) : key === 'true' ? value === true : key === 'false' ? value === false : key === 'null' ? value === null : value === undefined, `${key} assertion failed`); return expect(value); }
    if (key in methods) return methods[key];
    throw new Error(`Unsupported assertion in offline test: ${String(key)}`);
  } });
}
function scope(initial = {}, fallback) {
  const data = new Map(Object.entries(initial));
  const writes = [];
  return { data, writes, get(key) { return data.has(key) ? data.get(key) : fallback?.(key); }, has(key) { return data.has(key); },
    set(key, value) { data.set(key, value); writes.push([key, value]); }, unset(key) { data.delete(key); },
    toObject() { return Object.fromEntries(data); },
    replaceIn(value) { return String(value).replace(/\{\{([^}]+)\}\}/g, (match, key) => this.get(key) ?? match); },
  };
}
function headerBag(initial = []) {
  const list = initial.filter((item) => !item.disabled).map((item) => ({ ...item }));
  return { get(key) { return list.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value; },
    remove(key) { const index = list.findIndex((h) => h.key.toLowerCase() === key.toLowerCase()); if (index >= 0) list.splice(index, 1); },
    upsert(item) { this.remove(item.key); list.push({ ...item }); }, add(item) { list.push({ ...item }); }, all() { return list; },
  };
}
function sandbox(entry, options = {}) {
  const config = Object.fromEntries((collection.variable || []).map((v) => [v.key, v.value]));
  const vars = scope({ ...config, ...fixtureVariables, ...options.collection });
  const globals = scope(options.globals || {});
  const env = scope(options.noEnvironment ? {} : { base_url: 'https://supabase.unit.invalid/rest/v1', public_base_url: 'https://app.unit.invalid',
    // Syntactically valid offline fixtures. These are not credentials and are never sent.
    apikey: 'fixture-publishable-key', authorization: 'Bearer fixture.header.signature', partner_key: `bk_live_${'0'.repeat(48)}`,
    allow_write_requests: 'false', ...options.environment });
  const locals = scope({}, (key) => env.get(key) ?? vars.get(key) ?? globals.get(key));
  const state = { skipped: false, failures: [], tests: [], jsonCalls: 0 };
  const status = options.status ?? 200;
  const body = options.rawBody ?? JSON.stringify(options.body ?? { meta: { contract_version: '1.0.0', total: 1, next_cursor: null }, data: [{ id: 'HLOZZZ0000000001', type: 'HLO' }] });
  const pm = {
    variables: locals, environment: env, collectionVariables: vars, globals,
    info: { requestName: entry.item.name },
    request: { ...entry.item.request, headers: headerBag(entry.item.request.header || []),
      url: { toString: () => rawUrl(entry), query: headerBag(entry.item.request.url.query || []) } },
    response: { code: status, text: () => body, json() { state.jsonCalls += 1; return JSON.parse(body); },
      to: { have: { status(expected) { assert.equal(status, expected); } } },
      headers: headerBag([{ key: 'Content-Type', value: options.contentType || 'application/json; charset=utf-8' }, { key: 'ETag', value: '"fixture-etag"' }, { key: 'X-Bertel-Api-Version', value: '1.0.0' }, { key: 'X-Bertel-Vocabulary-Release', value: '42' }]) },
    execution: { skipRequest() { state.skipped = true; } },
    expect,
    test(name, fn) { state.tests.push(name); try { fn(); } catch (error) { state.failures.push(`${name}: ${error.message}`); } },
  };
  function run(owner, kind) {
    for (const source of scripts(owner, kind)) {
      new vm.Script(`(function () {\n${source}\n})();`, { filename: `${owner.name || 'collection'}:${kind}` }).runInNewContext({ pm, console: { log() {}, info() {}, warn() {}, error() {} }, URL }, { timeout: 1000 });
    }
  }
  return { pm, state, pre() { for (const owner of [collection, ...entry.ancestors, entry.item]) { run(owner, 'prerequest'); if (state.skipped) break; } return this; },
    post({ globalOnly = false } = {}) { for (const owner of globalOnly ? [collection] : [collection, ...entry.ancestors, entry.item]) run(owner, 'test'); return this; } };
}

check('only reviewed interface surfaces are present', () => {
  for (const entry of entries) {
    assert.ok(rpcName(entry) ? allowedRpc.has(rpcName(entry)) : publicPath(entry) !== undefined, `unreviewed URL: ${rawUrl(entry)}`);
  for (const owner of [collection, entry.item, ...entry.ancestors]) for (const kind of ['prerequest', 'test']) for (const source of scripts(owner, kind)) {
      assert.ok(!/\bpm\.sendRequest\s*\(|\bpm\.execution\.runRequest\s*\(|\bfetch\s*\(/.test(source), 'secondary HTTP calls require explicit review');
      new vm.Script(`(function () {\n${source}\n})();`);
    }
  }
});
check('all canonical OpenAPI methods have successful examples', () => {
  for (const [route, spec] of Object.entries(openapi.paths)) for (const method of Object.keys(spec).filter((key) => /^(get|post|put|patch|delete|head|options)$/.test(key))) {
    const matches = publicEntries.filter((entry) => entry.item.request.method.toLowerCase() === method && routePattern(route).test(publicPath(entry)));
    assert.ok(matches.length > 0, `missing ${method.toUpperCase()} ${route}`);
    assert.ok(matches.some((entry) => { const s = sandbox(entry).pre(); return !s.state.skipped && String(s.pm.variables.get('expected_status') || 200) === '200'; }), `no success example for ${route}`);
  }
  for (const entry of publicEntries) assert.ok(Object.entries(openapi.paths).some(([route, spec]) => spec[entry.item.request.method.toLowerCase()] && routePattern(route).test(publicPath(entry))), `unknown public route ${publicPath(entry)}`);
});
check('OpenAPI and implemented public HTTP routes agree', () => {
  const routeRoot = path.join(__dirname, '../bertel-tourism-ui/src/app/api/public');
  const implemented = new Set();
  const canonical = (route) => route.replace(/\{[^/]+\}/g, '{}');
  function scan(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) scan(file);
      else if (item.name === 'route.ts') {
        const route = `/${path.relative(routeRoot, directory).split(path.sep).join('/')}`.replace(/\[[^/]+\]/g, '{}');
        const source = fs.readFileSync(file, 'utf8');
        const methods = [...source.matchAll(/^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/gm)].map((match) => match[1]);
        assert.ok(methods.length > 0, `review unrecognized route export syntax: ${file}`);
        for (const method of methods) implemented.add(`${method} ${route}`);
      }
    }
  }
  scan(routeRoot);
  const documented = new Set(Object.entries(openapi.paths).flatMap(([route, spec]) => Object.keys(spec).filter((method) => /^(get|post|put|patch|delete|head|options)$/.test(method)).map((method) => `${method.toUpperCase()} ${canonical(route)}`)));
  assert.deepEqual([...implemented].sort(), [...documented].sort(), 'a public HTTP route is missing from OpenAPI, or OpenAPI describes an unimplemented route');
});
check('legacy RPC signatures and object types remain canonical', () => {
  const types = new Set(graph.nodes.find((n) => n.kind === 'enum' && n.id === 'public.object_type').props.values);
  for (const entry of legacy) {
    const fn = graph.nodes.find((n) => n.kind === 'function' && n.schema === 'api' && n.label === rpcName(entry));
    assert.ok(fn, `missing RPC ${rpcName(entry)}`);
    const body = JSON.parse(sandbox(entry).pm.variables.replaceIn(entry.item.request.body?.raw || '{}'));
    const argumentNames = new Set([...fn.props.signature.matchAll(/\b(p_\w+)\s/g)].map((m) => m[1]));
    for (const key of Object.keys(body)) assert.ok(argumentNames.has(key), `unknown ${key} for ${rpcName(entry)}`);
    for (const type of [...(body.p_types || []), ...(body.p_object_types || [])]) assert.ok(types.has(type), `invalid object type ${type}`);
  }
});
check('filter keys are implemented and sample codes are qualified', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../Base de donnée DLL et API/api_views_functions.sql'), 'utf8');
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION api.get_filtered_object_ids(');
  const end = sql.indexOf('$$;', start);
  assert.ok(start >= 0 && end > start, 'canonical filter implementation not found');
  const implementation = sql.slice(start, end);
  const topKeys = new Set([...implementation.matchAll(/\bfilters\s*(?:->>?|\?)\s*'([^']+)'/g)].map((match) => match[1]));
  const nestedKeys = (parent) => new Set([...implementation.matchAll(new RegExp(`\\bfilters\\s*->\\s*'${parent}'\\s*(?:->>?|\\?)\\s*'([^']+)'`, 'g'))].map((match) => match[1]));
  const directDomains = { amenities_any: 'amenity', amenities_all: 'amenity', amenity_families_any: 'amenity_family', payment_methods_any: 'payment_method', environment_tags_any: 'environment_tag', languages_any: 'language', media_types_any: 'media_type', tags_any: 'tag_slug', label_scheme_ranked: 'classification_scheme', disability_types_any: 'disability_type', label_disability_types_any: 'disability_type' };
  function codes(domain, values, context) {
    if (values == null) return;
    for (const value of Array.isArray(values) ? values : [values]) assert.ok(sampleCatalog.codes[domain]?.includes(value), `review sample vocabulary for ${context}: ${JSON.stringify(value)} is not a confirmed ${domain} code`);
  }
  for (const entry of legacy) {
    const body = JSON.parse(sandbox(entry).pm.variables.replaceIn(entry.item.request.body?.raw || '{}'));
    for (const [field, domain] of Object.entries({ p_lang_prefs: 'language', p_languages: 'language', p_preferred_tags: 'media_tag', p_cuisine_types: 'cuisine_type' })) codes(domain, body[field], field);
    const filters = body.p_filters || {};
    for (const key of Object.keys(filters)) assert.ok(topKeys.has(key), `filter key not read by canonical SQL: ${key}`);
    for (const [key, domain] of Object.entries(directDomains)) codes(domain, filters[key], key);
    for (const parent of ['itinerary', 'meeting_room', 'within_radius']) {
      const accepted = nestedKeys(parent);
      for (const key of Object.keys(filters[parent] || {})) assert.ok(accepted.has(key), `unimplemented ${parent}.${key}`);
    }
    codes('iti_practice', filters.itinerary?.practices_any, 'itinerary.practices_any');
    codes('meeting_equipment', filters.meeting_room?.equipment_any, 'meeting_room.equipment_any');
    codes('meeting_equipment', filters.meeting_room?.equipment_all, 'meeting_room.equipment_all');
    for (const metric of filters.capacity_filters || []) {
      for (const key of Object.keys(metric)) assert.ok(['code', 'min', 'max'].includes(key));
      codes('capacity_metric', metric.code, 'capacity_filters.code');
    }
    for (const classification of filters.classifications_any || []) {
      assert.ok(sampleCatalog.classification_values[classification.scheme_code]?.includes(classification.value_code), 'classification value is not qualified by its confirmed scheme');
    }
  }
});
check('RPC authentication, profiles and absent-session behavior', () => {
  for (const entry of legacy.filter((entry) => rpcName(entry) !== 'list_objects_with_validated_changes_since')) {
    const s = sandbox(entry, { environment: { allow_write_requests: 'true' } }).pre();
    assert.equal(s.pm.request.headers.get('Content-Profile'), 'api');
    assert.equal(s.pm.variables.replaceIn(s.pm.request.headers.get('apikey')), 'fixture-publishable-key');
    assert.equal(s.pm.variables.replaceIn(s.pm.request.headers.get('Authorization')), 'Bearer fixture.header.signature');
    const absent = sandbox(entry, { environment: { allow_write_requests: 'true', authorization: '' } }).pre();
    assert.ok(absent.state.skipped, `RPC sent without user session: ${rpcName(entry)}`);
  }
});
check('partner requests use their dedicated key', () => {
  for (const entry of publicEntries) {
    const s = sandbox(entry).pre();
    const auth = s.pm.variables.replaceIn(s.pm.request.headers.get('Authorization') || '');
    if (Number(s.pm.variables.get('expected_status')) !== 401) assert.equal(auth, `Bearer bk_live_${'0'.repeat(48)}`);
    assert.ok(!auth.includes('fixture.header.signature'), 'user JWT leaked to partner request');
    assert.equal(s.pm.request.headers.get('apikey'), undefined);
  }
});
check('writes are skipped by default and require explicit opt-in', () => {
  for (const name of writeRpc) {
    const examples = legacy.filter((entry) => rpcName(entry) === name);
    assert.ok(examples.length > 0, `missing guarded write ${name}`);
    for (const entry of examples) {
      assert.ok(sandbox(entry).pre().state.skipped, `${name} enabled by default`);
      assert.ok(sandbox(entry, { environment: { allow_write_requests: '' } }).pre().state.skipped, `${name} enabled without flag`);
      assert.equal(sandbox(entry, { environment: { allow_write_requests: 'true' } }).pre().state.skipped, false, `${name} fixture opt-in cannot proceed`);
    }
  }
  assert.ok(sandbox(legacy.find((e) => rpcName(e) === 'list_objects_with_validated_changes_since')).pre().state.skipped, 'server-only example should stay skipped');
});
check('dynamic captures cannot be shadowed by exported environment defaults', () => {
  const exported = new Set(environment.values.map((v) => v.key));
  for (const key of dynamicKeys) assert.ok(!exported.has(key), `${key} shadows collection state in environment`);
  const entry = publicEntries.find((e) => /\/thesaurus\/releases\/\{\{[^}]+\}\}\/concepts$/.test(publicPath(e)) && !/cursor=/.test(rawUrl(e)));
  assert.ok(entry, 'missing concept-list prerequisite example');
  const s = sandbox(entry, { environment: { thesaurus_release_id: 'stale-environment' }, collection: { thesaurus_release_id: '42' } }).pre();
  assert.equal(s.state.skipped, false);
  assert.equal(String(s.pm.variables.get('thesaurus_release_id')), '42');
});

const ordinary = publicEntries.find((e) => publicPath(e) === '/objects' && !/selection_id|include_selection_ids/.test(rawUrl(e)));
check('ordinary JSON succeeds and unexpected status fails', () => {
  const ok = sandbox(ordinary).pre().post({ globalOnly: true });
  assert.ok(ok.state.tests.length > 0);
  assert.deepEqual(ok.state.failures, []);
  assert.ok(sandbox(ordinary, { status: 500 }).pre().post({ globalOnly: true }).state.failures.length > 0);
});
check('canonical RPC id is asserted and captured', () => {
  const detail = legacy.find((e) => rpcName(e) === 'get_object_resource');
  const detailResult = sandbox(detail, { body: { id: 'HLOFIXTURE', type: 'HLO', status: 'published' } }).pre().post({ globalOnly: true });
  assert.deepEqual(detailResult.state.failures, []);
  const list = legacy.find((e) => rpcName(e) === 'list_object_resources_page');
  const result = sandbox(list, { body: { meta: { kind: 'page', language: 'fr' }, data: [{ id: 'FRESH', type: 'ITI' }] } }).pre().post({ globalOnly: true });
  assert.deepEqual(result.state.failures, []);
  assert.equal(result.pm.collectionVariables.get('object_id'), 'FRESH');
});
check('JSON-LD export accepts its media type and semantic graph', () => {
  const entry = publicEntries.find((e) => /\/export/.test(publicPath(e)) && /format=jsonld/.test(rawUrl(e)));
  assert.ok(entry, 'missing JSON-LD export');
  const s = sandbox(entry, { contentType: 'application/ld+json', body: { '@context': {}, '@graph': [] } }).pre().post({ globalOnly: true });
  assert.equal(s.state.skipped, false);
  assert.deepEqual(s.state.failures, []);
  assert.ok(s.state.jsonCalls > 0);
});
check('304 is accepted without parsing an absent JSON body', () => {
  const entry = publicEntries.find((e) => scripts(e.item, 'prerequest').some((s) => /expected_status[\s\S]{0,80}304/.test(s)));
  assert.ok(entry, 'missing conditional-read example');
  const s = sandbox(entry, { status: 304, rawBody: '' }).pre().post();
  assert.equal(s.state.skipped, false);
  assert.deepEqual(s.state.failures, []);
  assert.equal(s.state.jsonCalls, 0);
});
check('negative cases validate their expected status instead of generic 200', () => {
  const cases = publicEntries.filter((e) => scripts(e.item, 'prerequest').some((s) => /expected_status[\s\S]{0,80}(400|404)/.test(s)));
  assert.ok(cases.length >= 2, 'missing invalid-parameter/not-found examples');
  for (const entry of cases) {
    const before = sandbox(entry).pre();
    const expected = Number(before.pm.variables.get('expected_status'));
    assert.ok(expected === 400 || expected === 404);
    const response = sandbox(entry, { status: expected, body: { error: expected === 404 ? 'not_found' : 'bad_request' } }).pre().post({ globalOnly: true });
    assert.deepEqual(response.state.failures, []);
    assert.ok(sandbox(entry, { status: 200 }).pre().post({ globalOnly: true }).state.failures.length > 0);
  }
});
check('scripts do not overwrite captured environment values', () => {
  for (const owner of [collection, ...entries.flatMap((e) => [e.item, ...e.ancestors])]) {
    for (const kind of ['prerequest', 'test']) for (const source of scripts(owner, kind)) {
      assert.ok(!/pm\.environment\.set\s*\(/.test(source), 'captures must live in collection/local scope');
    }
  }
});

check('distributed credentials are empty and write opt-in defaults to false', () => {
  for (const key of ['apikey', 'authorization', 'partner_key']) {
    assert.equal(collection.variable.find((v) => v.key === key), undefined, `collection credential masks existing Globals: ${key}`);
    const exported = environment.values.find((v) => v.key === key);
    assert.equal(exported?.value, '', `credential exported: ${key}`);
    assert.equal(exported?.type, 'secret');
  }
  for (const variables of [collection.variable, environment.values]) assert.equal(variables.find((v) => v.key === 'allow_write_requests')?.value, 'false');
});
check('No Environment preserves Globals credentials; explicit empty environment masks them', () => {
  const globals = { apikey: 'fixture-publishable-key', authorization: 'fixture.header.signature', partner_key: `bk_live_${'0'.repeat(48)}` };
  const rpc = legacy.find((entry) => rpcName(entry) === 'get_object_resource');
  const rpcGlobals = sandbox(rpc, { globals, noEnvironment: true }).pre();
  assert.equal(rpcGlobals.state.skipped, false);
  assert.equal(rpcGlobals.pm.variables.get('rpc_authorization'), 'Bearer fixture.header.signature');
  assert.equal(sandbox(ordinary, { globals, noEnvironment: true }).pre().state.skipped, false);
  assert.ok(sandbox(rpc, { globals, environment: { apikey: '', authorization: '' } }).pre().state.skipped);
  assert.ok(sandbox(ordinary, { globals, environment: { partner_key: '' } }).pre().state.skipped);
});
check('URL defaults preserve configured targets and distinguish absent from empty', () => {
  for (const key of ['base_url', 'public_base_url']) assert.equal(collection.variable.find((v) => v.key === key), undefined, `collection URL masks Globals: ${key}`);
  const rpc = legacy.find((entry) => rpcName(entry) === 'get_object_resource');
  const credentials = { apikey: 'fixture-publishable-key', authorization: 'fixture.header.signature', partner_key: `bk_live_${'0'.repeat(48)}` };
  const globals = { ...credentials, base_url: 'https://staging-db.unit.invalid/rest/v1', public_base_url: 'https://staging-app.unit.invalid' };
  const inherited = sandbox(rpc, { globals, noEnvironment: true }).pre();
  assert.equal(inherited.state.skipped, false);
  assert.equal(inherited.pm.variables.get('base_url'), globals.base_url);
  assert.equal(inherited.pm.variables.get('public_base_url'), globals.public_base_url);
  const custom = sandbox(rpc, { globals, noEnvironment: true, collection: { base_url: 'https://custom-db.unit.invalid/rest/v1' } }).pre();
  assert.equal(custom.pm.variables.get('base_url'), 'https://custom-db.unit.invalid/rest/v1');
  assert.ok(sandbox(rpc, { globals, environment: { base_url: '' } }).pre().state.skipped);
  assert.ok(sandbox(ordinary, { globals, environment: { public_base_url: '' } }).pre().state.skipped);
  const absent = sandbox(rpc, { globals: credentials, noEnvironment: true }).pre();
  assert.equal(absent.state.skipped, false);
  assert.equal(absent.pm.variables.get('base_url'), 'https://supabertel.otisud.re/rest/v1');
  assert.equal(absent.pm.variables.get('public_base_url'), 'https://bertel.otisud.re');
});
check('manifest discovery captures a fresh release and invalidates dependent state', () => {
  const entry = publicEntries.find((e) => publicPath(e) === '/thesaurus' && String(sandbox(e).pre().pm.variables.get('expected_status')) === '200');
  const s = sandbox(entry, {
    collection: { thesaurus_release_id: '17', thesaurus_previous_release_id: '16', thesaurus_next_cursor: 'stale' },
    environment: { thesaurus_release_id: 'stale-environment' },
    body: { meta: { contract_version: '1.0.0', release_id: 42, previous_release_id: 39, vocabulary_release: 42 }, data: { domains: [] } },
  }).pre().post();
  assert.deepEqual(s.state.failures, []);
  assert.equal(s.pm.collectionVariables.get('thesaurus_release_id'), '42');
  assert.equal(s.pm.collectionVariables.get('thesaurus_previous_release_id'), '39');
  assert.equal(s.pm.collectionVariables.get('thesaurus_etag'), '"fixture-etag"');
  assert.equal(s.pm.collectionVariables.get('thesaurus_next_cursor'), undefined);
  assert.equal(s.pm.collectionVariables.get('thesaurus_concept_id'), undefined);
  assert.equal(s.pm.environment.get('thesaurus_release_id'), 'stale-environment');
  assert.equal(s.pm.environment.writes.length, 0);
});
check('empty terminal concept pages clear stale cursors and concept dependencies', () => {
  const entry = publicEntries.find((e) => /\/thesaurus\/releases\/\{\{[^}]+\}\}\/concepts$/.test(publicPath(e)) && /page_size=2/.test(rawUrl(e)) && !/cursor=/.test(rawUrl(e)));
  const s = sandbox(entry, { body: { meta: { contract_version: '1.0.0', release_id: 42, vocabulary_release: 42, next_cursor: null }, data: [] } }).pre().post();
  assert.deepEqual(s.state.failures, []);
  assert.equal(s.pm.collectionVariables.get('thesaurus_next_cursor'), undefined);
  assert.equal(s.pm.collectionVariables.get('thesaurus_concept_id'), undefined);
  const detail = publicEntries.find((e) => /\/objects\/\{\{public_object_id\}\}$/.test(publicPath(e)));
  assert.ok(detail);
  assert.ok(sandbox(detail, { collection: { public_object_id: '' }, environment: { public_object_id: 'stale-environment' } }).pre().state.skipped);
});
check('JSON-LD and conditional-read assertions reject broken representations', () => {
  const ld = publicEntries.find((e) => /\/export/.test(publicPath(e)) && /format=jsonld/.test(rawUrl(e)));
  const badGraph = sandbox(ld, { contentType: 'application/ld+json', body: { '@context': {}, '@graph': {} } }).pre().post({ globalOnly: true });
  assert.ok(badGraph.state.failures.length > 0);
  const conditional = publicEntries.find((e) => scripts(e.item, 'prerequest').some((s) => /expected_status[\s\S]{0,80}304/.test(s)));
  const bad304 = sandbox(conditional, { status: 304, rawBody: '{}' }).pre().post({ globalOnly: true });
  assert.ok(bad304.state.failures.length > 0);
  assert.equal(bad304.state.jsonCalls, 0);
});

console.log(`Postman checks PASS: ${passed} offline checks; ${Object.keys(openapi.paths).length} OpenAPI paths; ${entries.length} requests. No HTTP or database execution.`);
