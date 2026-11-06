import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { admitPartner, logPartnerCall } from './partner-auth';
import { callPublicRpc, PUBLIC_API_CONTRACT_VERSION, publicHeaders } from './public-api';

export type ThesaurusAction = 'manifest' | 'release' | 'concepts' | 'concept' | 'changes' | 'export' | 'resolve';
export interface ThesaurusTarget {
  action: ThesaurusAction;
  releaseId?: string;
  conceptId?: string;
}
type JsonObject = Record<string, unknown>;
interface Query {
  domains: string[];
  status: string[];
  lang: string;
  query: string | null;
  pageSize: number;
  format: 'json' | 'jsonld';
  cursor: string | null;
}
interface Cursor {
  version: 1;
  release: number;
  scope: string;
  after: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIFECYCLES = new Set(['active', 'deprecated', 'retired']);
const PUBLIC_CONCEPT_KEYS = [
  'concept_id', 'uri', 'domain', 'code', 'context_key', 'name', 'description', 'preferred_labels', 'definitions',
  'labels', 'notes', 'sources', 'broader', 'narrower', 'related', 'replaced_by', 'relations',
  'mappings', 'lifecycle', 'assignable', 'valid_from', 'valid_to', 'effective_lang',
] as const;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

/** Canonical JSON keeps ETags and continuation tokens stable across object-key ordering. */
export function canonicalThesaurusJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalThesaurusJson).join(',')}]`;
  const record = object(value);
  if (record) {
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalThesaurusJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalThesaurusJson(value)).digest('hex');
}

function cursorSecret(): string {
  const secret = (process.env.THESAURUS_CURSOR_SECRET ?? '').trim()
    || (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!secret) throw new Error('cursor_configuration');
  return secret;
}

export function encodeThesaurusCursor(cursor: Cursor): string {
  const payload = Buffer.from(canonicalThesaurusJson(cursor)).toString('base64url');
  const signature = createHmac('sha256', cursorSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function decodeThesaurusCursor(token: string, release: number, scope: string): string {
  if (token.length > 1500 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error('invalid_cursor');
  const [payload, signature] = token.split('.');
  const expected = createHmac('sha256', cursorSecret()).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('invalid_cursor');
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new Error('invalid_cursor'); }
  const row = object(decoded);
  if (!row || row.version !== 1 || row.release !== release || row.scope !== scope
    || typeof row.after !== 'string' || !UUID.test(row.after)
    || Object.keys(row).some((key) => !['version', 'release', 'scope', 'after'].includes(key))) {
    throw new Error('invalid_cursor');
  }
  return row.after.toLowerCase();
}

function parseList(value: string | null, kind: 'domain' | 'status'): string[] {
  if (value === null) return [];
  const values = value.split(',').map((part) => part.trim());
  if (values.length > 100 || values.some((part) => !part
    || (kind === 'domain' ? !/^[a-z][a-z0-9_]{0,79}$/.test(part) : !LIFECYCLES.has(part)))) {
    throw new Error('invalid_parameters');
  }
  return [...new Set(values)].sort();
}

function parseQuery(url: URL, action: ThesaurusAction): Query {
  const paging = action === 'concepts' || action === 'changes';
  const supported = new Set(['lang', 'domains', 'status']);
  if (paging) ['cursor', 'page_size', 'query'].forEach((name) => supported.add(name));
  if (action === 'export') supported.add('format');
  if (action === 'concept' || action === 'resolve') {
    supported.delete('domains'); supported.delete('status');
  }
  for (const name of url.searchParams.keys()) {
    if (!supported.has(name) || url.searchParams.getAll(name).length !== 1) throw new Error('invalid_parameters');
  }
  const rawLang = (url.searchParams.get('lang') ?? 'fr').trim();
  let lang: string;
  try {
    if (!rawLang || rawLang.length > 35 || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(rawLang)) throw new Error();
    lang = Intl.getCanonicalLocales(rawLang)[0];
  } catch { throw new Error('invalid_parameters'); }
  const rawSize = url.searchParams.get('page_size') ?? '100';
  if (!/^[1-9]\d{0,2}$/.test(rawSize) || Number(rawSize) > 200) throw new Error('invalid_parameters');
  const query = url.searchParams.get('query')?.trim().normalize('NFC') || null;
  if (query && query.length > 200) throw new Error('invalid_parameters');
  const format = url.searchParams.get('format') ?? 'json';
  if (format !== 'json' && format !== 'jsonld') throw new Error('invalid_parameters');
  const cursor = url.searchParams.get('cursor');
  if (cursor !== null && !cursor) throw new Error('invalid_cursor');
  return {
    domains: parseList(url.searchParams.get('domains'), 'domain'),
    status: parseList(url.searchParams.get('status'), 'status'),
    lang, query, pageSize: Number(rawSize), format, cursor,
  };
}

function stringMap(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, text] of Object.entries(object(value) ?? {})) {
    if (typeof text === 'string' && text.trim()) result[key] = text;
  }
  return result;
}

function localized(values: Record<string, string>, requested: string): { value: string | null; lang: string | null } {
  const candidates = [requested, requested.toLowerCase(), requested.split('-')[0], 'fr', ...Object.keys(values).sort()];
  for (const lang of candidates) if (values[lang]) return { value: values[lang], lang };
  return { value: null, lang: null };
}

/** Explicit public projection: new private fields added to a snapshot never leak by default. */
export function publicThesaurusConcept(value: unknown, requestedLang = 'fr'): JsonObject {
  const source = object(value);
  if (!source || typeof source.concept_id !== 'string' || !UUID.test(source.concept_id)
    || typeof source.uri !== 'string' || !/^(?:https?:\/\/|urn:)/.test(source.uri)) throw new Error('invalid_snapshot');
  const result: JsonObject = {};
  for (const key of PUBLIC_CONCEPT_KEYS) if (source[key] !== undefined) result[key] = source[key];
  const labels = stringMap(source.preferred_labels);
  const definitions = stringMap(source.definitions);
  const name = localized(labels, requestedLang);
  const definition = localized(definitions, requestedLang);
  result.preferred_labels = labels;
  result.definitions = definitions;
  result.labels = (Array.isArray(source.labels) ? source.labels : []).flatMap((item) => {
    const row = object(item);
    return row && typeof row.lang === 'string' && typeof row.value === 'string' && (row.kind === 'alt' || row.kind === 'hidden')
      ? [{ lang: row.lang, kind: row.kind, value: row.value }] : [];
  });
  result.notes = (Array.isArray(source.notes) ? source.notes : []).flatMap((item) => {
    const row = object(item);
    if (!row || typeof row.lang !== 'string' || typeof row.type !== 'string' || typeof row.value !== 'string') return [];
    return [{ lang: row.lang, type: row.type, value: row.value, ...(typeof row.source === 'string' ? { source: row.source } : {}) }];
  });
  result.relations = (Array.isArray(source.relations) ? source.relations : []).flatMap((item) => {
    const row = object(item);
    return row && typeof row.type === 'string' && typeof row.target_id === 'string'
      ? [{ type: row.type, target_id: row.target_id }] : [];
  });
  result.mappings = (Array.isArray(source.mappings) ? source.mappings : []).flatMap((item) => {
    const row = object(item);
    if (!row || typeof row.type !== 'string' || typeof row.target_uri !== 'string') return [];
    const mapped: JsonObject = { type: row.type, target_uri: row.target_uri };
    for (const key of ['vocabulary', 'version', 'source']) if (typeof row[key] === 'string') mapped[key] = row[key];
    return [mapped];
  });
  for (const key of ['broader', 'narrower', 'related', 'replaced_by']) {
    result[key] = (Array.isArray(source[key]) ? source[key] as unknown[] : []).filter((id): id is string => typeof id === 'string' && UUID.test(id));
  }
  if (name.value !== null) result.name = name.value;
  if (definition.value !== null) result.description = definition.value;
  result.requested_lang = requestedLang;
  result.effective_lang = name.lang;
  result.definition_lang = definition.lang;
  return result;
}

const SKOS_CONTEXT = {
  skos: 'http://www.w3.org/2004/02/skos/core#',
  dct: 'http://purl.org/dc/terms/',
  bertel: 'urn:bertel:thesaurus:',
  prefLabel: { '@id': 'skos:prefLabel', '@container': '@language' },
  definition: { '@id': 'skos:definition', '@container': '@language' },
  code: 'skos:notation',
  domain: 'bertel:domain',
  context_key: 'bertel:contextKey',
  concept_id: 'dct:identifier',
  lifecycle: 'bertel:lifecycle',
  assignable: 'bertel:assignable',
  valid_from: 'bertel:validFrom', valid_to: 'bertel:validTo',
  relations: 'bertel:relations', mappings: 'bertel:mappings', notes: 'bertel:notes', sources: 'dct:source',
  type: 'bertel:type', target_id: 'bertel:targetId', target_uri: { '@id': 'bertel:targetUri', '@type': '@id' },
  vocabulary: 'bertel:vocabulary', version: 'bertel:version', source: 'dct:source', lang: 'bertel:language', value: 'bertel:value',
};

/** Serialize the same immutable concept records; language maps never label a fallback as a translation. */
export function thesaurusJsonLd(values: unknown[]): JsonObject {
  const concepts = values.map((value) => publicThesaurusConcept(value));
  const uris = new Map(concepts.map((concept) => [concept.concept_id as string, concept.uri as string]));
  const targetUri = (id: string, source: JsonObject): string => {
    const known = uris.get(id);
    if (known) return known;
    const ownId = source.concept_id as string;
    const ownUri = source.uri as string;
    if (!ownUri.endsWith(ownId)) throw new Error('invalid_snapshot_relation');
    return ownUri.slice(0, -ownId.length) + id;
  };
  const graph = concepts.map((concept) => {
    const node: JsonObject = { '@id': concept.uri, '@type': 'skos:Concept',
      concept_id: concept.concept_id, code: concept.code, domain: concept.domain, context_key: concept.context_key ?? '',
      prefLabel: concept.preferred_labels, definition: concept.definitions,
      lifecycle: concept.lifecycle, assignable: concept.assignable,
      valid_from: concept.valid_from, valid_to: concept.valid_to,
      notes: concept.notes, mappings: concept.mappings, relations: concept.relations };
    if (concept.sources !== undefined) node.sources = concept.sources;
    const labels = concept.labels as Array<{ lang: string; kind: string; value: string }>;
    for (const [kind, property] of [['alt', 'skos:altLabel'], ['hidden', 'skos:hiddenLabel']]) {
      const items = labels.filter((label) => label.kind === kind).map((label) => ({ '@value': label.value, '@language': label.lang }));
      if (items.length) node[property] = items;
    }
    const noteTypes: Record<string, string> = {
      scope: 'scopeNote', scopeNote: 'scopeNote', scope_note: 'scopeNote',
      editorial: 'editorialNote', editorialNote: 'editorialNote',
      history: 'historyNote', historyNote: 'historyNote',
      change: 'changeNote', changeNote: 'changeNote', example: 'example', note: 'note',
    };
    for (const note of concept.notes as JsonObject[]) {
      const property = noteTypes[note.type as string];
      if (property) {
        const key = `skos:${property}`;
        node[key] = [...(Array.isArray(node[key]) ? node[key] as unknown[] : []),
          { '@value': note.value, '@language': note.lang }];
      }
    }
    for (const [key, property] of [['broader', 'skos:broader'], ['narrower', 'skos:narrower'], ['related', 'skos:related'], ['replaced_by', 'dct:isReplacedBy']]) {
      const ids = concept[key] as string[];
      if (ids.length) node[property] = ids.map((id) => ({ '@id': targetUri(id, concept) }));
    }
    const mappingTypes: Record<string, string> = { exact: 'exactMatch', close: 'closeMatch', broad: 'broadMatch', narrow: 'narrowMatch', related: 'relatedMatch', exactMatch: 'exactMatch', closeMatch: 'closeMatch', broadMatch: 'broadMatch', narrowMatch: 'narrowMatch', relatedMatch: 'relatedMatch' };
    for (const mapping of concept.mappings as JsonObject[]) {
      const property = mappingTypes[mapping.type as string];
      if (property) {
        const key = `skos:${property}`;
        node[key] = [...(Array.isArray(node[key]) ? node[key] as unknown[] : []), { '@id': mapping.target_uri }];
      }
    }
    return node;
  });
  return { '@context': SKOS_CONTEXT, '@graph': graph };
}

function scopeFor(target: ThesaurusTarget, query: Query): string {
  return digest({ action: target.action, domains: query.domains, status: query.status,
    lang: query.lang, query: query.query, page_size: query.pageSize, format: query.format });
}

/** All admission occurs before parsing a cursor, loading a snapshot or returning 304. */
export async function handleThesaurusRequest(req: NextRequest, target: ThesaurusTarget): Promise<NextResponse> {
  const headers = { ...publicHeaders(), 'Cache-Control': 'private, no-cache', Vary: 'Authorization, Accept' };
  const admission = await admitPartner(req.headers.get('authorization'));
  if (!admission) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });
  const { partner, rate } = admission;
  Object.assign(headers, { 'X-RateLimit-Limit': String(rate.limit), 'X-RateLimit-Remaining': String(rate.remaining) });
  const path = `GET /api/public/thesaurus/${target.action}`;
  const audit = async (status: number) => { try { await logPartnerCall(partner.keyId, path, status); } catch { /* best effort */ } };
  const fail = async (status: number, error: string): Promise<NextResponse> => {
    await audit(status);
    return NextResponse.json({ error }, { status, headers });
  };
  if (!rate.allowed) {
    await audit(429);
    return NextResponse.json({ error: 'rate_limited', retry_after: rate.retryAfter }, {
      status: 429, headers: { ...headers, 'Retry-After': String(rate.retryAfter) },
    });
  }

  let release: number | null = null;
  if (target.releaseId !== undefined) {
    if (!/^[1-9]\d{0,15}$/.test(target.releaseId) || !Number.isSafeInteger(Number(target.releaseId))) return fail(400, 'invalid_release');
    release = Number(target.releaseId);
  }
  if (target.conceptId !== undefined && !UUID.test(target.conceptId)) return fail(400, 'invalid_concept_id');
  let query: Query;
  let after: string | null = null;
  try {
    query = parseQuery(new URL(req.url), target.action);
    if (query.cursor) {
      if (release === null) throw new Error('invalid_cursor');
      after = decodeThesaurusCursor(query.cursor, release, scopeFor(target, query));
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    return fail(reason === 'cursor_configuration' ? 500 : 400,
      reason === 'cursor_configuration' ? 'server_misconfigured' : reason === 'invalid_cursor' ? reason : 'invalid_parameters');
  }
  const params: JsonObject = { domains: query.domains.length ? query.domains : null,
    status: query.status.length ? query.status : null, lang: query.lang, query: query.query,
    page_size: query.pageSize, after, concept_id: target.conceptId?.toLowerCase() ?? null };
  let result;
  try {
    result = await callPublicRpc('thesaurus_public', { p_action: target.action, p_release_id: release, p_params: params });
  } catch { return fail(502, 'upstream_error'); }
  if (!result.ok) {
    await audit(result.status);
    return NextResponse.json(result.body, { status: result.status, headers });
  }
  const body = object(result.body);
  const rpcMeta = object(body?.meta);
  if (!body || !rpcMeta || !Number.isSafeInteger(Number(rpcMeta.release_id)) || Number(rpcMeta.release_id) < 1) {
    return fail(502, 'invalid_snapshot');
  }
  const actualRelease = Number(rpcMeta.release_id);
  if (release !== null && release !== actualRelease) return fail(502, 'invalid_snapshot');
  const meta: JsonObject = { contract_version: PUBLIC_API_CONTRACT_VERSION, release_id: actualRelease,
    vocabulary_release: actualRelease, previous_release_id: rpcMeta.previous_release_id ?? null,
    as_of: rpcMeta.as_of ?? null };
  let data: unknown = body.data;
  try {
    if (target.action === 'concept' || target.action === 'resolve') {
      if (data === null) return fail(404, 'not_found');
      data = publicThesaurusConcept(data, query.lang);
    } else if (target.action === 'concepts' || target.action === 'export') {
      if (!Array.isArray(data)) throw new Error('invalid_snapshot');
      data = data.map((item) => publicThesaurusConcept(item, query.lang));
    } else if (target.action === 'changes') {
      if (!Array.isArray(data)) throw new Error('invalid_snapshot');
      data = data.map((item) => {
        const row = object(item);
        if (!row || typeof row.concept_id !== 'string' || !UUID.test(row.concept_id)
          || !['added', 'modified', 'deprecated', 'retired'].includes(row.change_type as string)) throw new Error('invalid_snapshot');
        return { concept_id: row.concept_id, change_type: row.change_type,
          before: row.before ? publicThesaurusConcept(row.before, query.lang) : null,
          after: row.after ? publicThesaurusConcept(row.after, query.lang) : null };
      });
    }
    if (target.action === 'concepts' || target.action === 'changes') {
      meta.page_size = query.pageSize;
      meta.total = typeof rpcMeta.total === 'number' ? rpcMeta.total : null;
      const nextAfter = rpcMeta.next_after;
      if (nextAfter != null && (typeof nextAfter !== 'string' || !UUID.test(nextAfter))) throw new Error('invalid_snapshot');
      meta.next_cursor = typeof nextAfter === 'string'
        ? encodeThesaurusCursor({ version: 1, release: actualRelease, scope: scopeFor(target, query), after: nextAfter }) : null;
    }
    if (target.action === 'export' && query.format === 'jsonld') data = thesaurusJsonLd(data as unknown[]);
  } catch (error) {
    return fail(error instanceof Error && error.message === 'cursor_configuration' ? 500 : 502,
      error instanceof Error && error.message === 'cursor_configuration' ? 'server_misconfigured' : 'invalid_snapshot');
  }
  const envelope = { meta, data };
  const text = canonicalThesaurusJson(envelope);
  // A JSON-LD export is a standalone RDF document, with version data in HTTP headers.
  const standaloneJsonLd = target.action === 'export' && query.format === 'jsonld';
  const responseText = standaloneJsonLd ? canonicalThesaurusJson(data) : text;
  const contentType = standaloneJsonLd ? 'application/ld+json; charset=utf-8' : 'application/json; charset=utf-8';
  const etag = `"${createHash('sha256').update(contentType).update(':').update(responseText).digest('hex')}"`;
  const responseHeaders = { ...headers, ETag: etag,
    'X-Bertel-Vocabulary-Release': String(actualRelease), 'Content-Type': contentType };
  const candidates = req.headers.get('if-none-match')?.split(',').map((part) => part.trim()) ?? [];
  if (candidates.some((candidate) => candidate === '*' || candidate.replace(/^W\//, '') === etag)) {
    await audit(304);
    return new NextResponse(null, { status: 304, headers: responseHeaders });
  }
  await audit(200);
  return new NextResponse(responseText, { status: 200, headers: responseHeaders });
}
