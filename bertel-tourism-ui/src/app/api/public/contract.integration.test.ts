/** @jest-environment node */
// Only Next's build-time import sentinel is stubbed. Authentication, rate limiting,
// PostgREST, service-role SQL and all four route handlers are real.
jest.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { GET as listObjects } from './objects/route';
import { GET as getObject } from './objects/[id]/route';
import { GET as getCatalog } from './catalog/route';
import { GET as getDeletions } from './objects/deletions/route';
import { callPublicRpc } from '@/lib/public-api';
import { __resetServerSupabaseClientForTests } from '@/lib/supabase-server';

const enabled = process.env.BERTEL_EPHEMERAL_API_TEST === '1';
const isolatedSuite = enabled ? describe : describe.skip;
// Deliberately public test credential, installed only by the ephemeral CI fixture.
const testKey = `bk_live_${'a'.repeat(48)}`;
const ids = [
  'ACTRUN999999B101', 'ACTRUN999999B102',
  'ASCRUN999999B103', 'ASCRUN999999B104',
  'RESRUN999999B201', 'RESRUN999999B202', 'FMARUN999999B203',
];

function request(path: string, authenticated = true) {
  return new NextRequest(`http://localhost/api/public/${path}`, {
    headers: authenticated ? { authorization: `Bearer ${testKey}` } : {},
  });
}

function publicResource(raw: Record<string, unknown>) {
  const result = { ...raw };
  delete result.canonical_description;
  delete result.org_description;
  return result;
}

function assertNoActivityDetail(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoActivityDetail);
  } else if (value !== null && typeof value === 'object') {
    expect(value).not.toHaveProperty('equipment_provided_details');
    Object.values(value).forEach(assertNoActivityDetail);
  }
}

isolatedSuite('public API against ephemeral Supabase (no business mocks)', () => {
  beforeAll(() => {
    // Fail before creating a client or making a request. Never accept a production
    // URL accidentally inherited from a developer's .env.local.
    const target = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://invalid');
    expect(target.protocol).toBe('http:');
    expect(['127.0.0.1', 'localhost']).toContain(target.hostname);
    expect(target.port).toBe('54321');
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeTruthy();
    __resetServerSupabaseClientForTests();
  });

  it('keeps the unauthenticated error flat and versioned on every route', async () => {
    const responses = await Promise.all([
      listObjects(request('objects', false)),
      getObject(request(`objects/${ids[0]}`, false), { params: Promise.resolve({ id: ids[0] }) }),
      getCatalog(request('catalog', false)),
      getDeletions(request('objects/deletions?since=2026-01-01T00:00:00Z', false)),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.headers.get('X-Bertel-Api-Version')).toBe('1.0.0');
      expect(await response.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it.each(ids)('returns the real public SQL resource unchanged for %s', async (id) => {
    const response = await getObject(request(`objects/${id}`), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Bertel-Api-Version')).toBe('1.0.0');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('120');
    const remaining = Number(response.headers.get('X-RateLimit-Remaining'));
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBeLessThan(120); // the fail-open fallback returns 120
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['data', 'meta']);
    expect(body.meta).toEqual({ contract_version: '1.0.0' });
    expect(body.data.id).toBe(id); // prevents vacuous null-resource parity
    const sql = await callPublicRpc('get_object_resource', {
      p_object_id: id, p_lang_prefs: ['fr'], p_track_format: 'none', p_options: {},
    });
    expect(sql.ok).toBe(true);
    expect(body.data).toEqual(publicResource(sql.body as Record<string, unknown>));
    assertNoActivityDetail(body.data);
  });

  it('preserves the actual all-language enrichment instead of accepting a degraded 200', async () => {
    const id = 'RESRUN999999B201';
    const response = await getObject(request(`objects/${id}?lang=all`), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveProperty('i18n');
    const sql = await callPublicRpc('get_object_i18n_all', { p_object_id: id });
    expect(sql.ok).toBe(true);
    expect(body.data.i18n).toEqual(sql.body ?? {});
    expect(JSON.stringify(body.data.i18n)).toContain('English description');
    expect(JSON.stringify(body.data.i18n)).toContain('Restaurant');
  });

  it('keeps list defaults, ceilings, metadata and opaque pagination', async () => {
    for (const [query, pageSize] of [['', 50], ['?view=full', 25], ['?page_size=9999', 200], ['?view=full&page_size=9999', 100]] as const) {
      const response = await listObjects(request(`objects${query}`));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Object.keys(body.meta).sort()).toEqual(['contract_version', 'next_cursor', 'page_size', 'total']);
      expect(body.meta.contract_version).toBe('1.0.0');
      expect(body.meta.page_size).toBe(pageSize);
      expect(body.meta.total).toBeGreaterThanOrEqual(ids.length);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeLessThanOrEqual(pageSize);
      if (pageSize === 100) expect(body.data).toHaveLength(100);
      assertNoActivityDetail(body.data);
    }
    const firstResponse = await listObjects(request('objects?page_size=2'));
    const first = await firstResponse.json();
    expect(first.meta.next_cursor).toEqual(expect.any(String));
    expect(first.meta.next_cursor.length).toBeGreaterThan(0);
    const nextResponse = await listObjects(request(`objects?page_size=2&cursor=${encodeURIComponent(first.meta.next_cursor)}`));
    expect(nextResponse.status).toBe(200);
    const next = await nextResponse.json();
    expect(next.meta.total).toBe(first.meta.total);
    expect(next.data.length).toBe(2);
    expect(next.data.map((item: { id: string }) => item.id)).not.toEqual(first.data.map((item: { id: string }) => item.id));
  }, 60_000);

  it('preserves every catalog entry key and the real labels', async () => {
    const response = await getCatalog(request('catalog'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta).toEqual({ contract_version: '1.0.0' });
    const sql = await callPublicRpc('list_reference_bundle', { p_domains: null, p_lang: 'fr' });
    expect(sql.ok).toBe(true);
    expect(body.data).toEqual(sql.body);
    const entries = Object.values(body.data as Record<string, unknown[]>).flat();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(Object.keys(entry as object).sort()).toEqual(['code', 'domain', 'icon_url', 'name', 'parent_code']);
    }
  });

  it('keeps the tombstone envelope and the unknown-object error', async () => {
    const response = await getDeletions(request('objects/deletions?since=2026-01-01T00:00:00Z'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body.meta).sort()).toEqual(['contract_version', 'count', 'cursor']);
    expect(body.meta.contract_version).toBe('1.0.0');
    expect(Array.isArray(body.data)).toBe(true);
    for (const entry of body.data) expect(Object.keys(entry).sort()).toEqual(['deleted_at', 'object_id', 'type']);
    const id = 'RESRUN999999B299';
    const missing = await getObject(request(`objects/${id}`), { params: Promise.resolve({ id }) });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not_found' });
  });
});
