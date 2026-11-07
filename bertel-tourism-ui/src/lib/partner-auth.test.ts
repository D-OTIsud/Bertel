jest.mock('server-only', () => ({}));
jest.mock('./supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));

import { admitPartner, extractPartnerKey, hashPartnerKey } from './partner-auth';
import { getServerSupabaseClient } from './supabase-server';
import { PUBLIC_RPC_ALLOWLIST, callPublicRpc } from './public-api';

const VALID = 'bk_live_' + 'a'.repeat(48);

describe('partner-auth', () => {
  test('hashPartnerKey matches Postgres sha256 (Node↔DB consistency — the auth linchpin)', () => {
    // Ground truth computed live: SELECT encode(extensions.digest('bk_test','sha256'),'hex')
    expect(hashPartnerKey('bk_test')).toBe(
      'b9ea9a069e1c3d119069883debdf80af44b84dda0c2311afc2728aea4a9a3a88',
    );
  });

  test('extractPartnerKey accepts a well-formed key (with or without Bearer)', () => {
    expect(extractPartnerKey(`Bearer ${VALID}`)).toBe(VALID);
    expect(extractPartnerKey(VALID)).toBe(VALID);
    expect(extractPartnerKey(`  Bearer ${VALID}  `)).toBe(VALID);
  });

  test('extractPartnerKey rejects malformed / foreign tokens', () => {
    expect(extractPartnerKey(null)).toBeNull();
    expect(extractPartnerKey(undefined)).toBeNull();
    expect(extractPartnerKey('')).toBeNull();
    expect(extractPartnerKey('Bearer bk_live_short')).toBeNull();
    expect(extractPartnerKey('Bearer bk_live_' + 'A'.repeat(48))).toBeNull(); // uppercase hex rejected (DB stores lowercase)
    expect(extractPartnerKey('Bearer bk_live_' + 'a'.repeat(47))).toBeNull(); // wrong length
    expect(extractPartnerKey('Bearer someopaque.jwt.value')).toBeNull();
    expect(extractPartnerKey('Bearer sk_live_' + 'a'.repeat(48))).toBeNull(); // wrong prefix
  });

  test('public RPC allowlist contains only public reads — never writers/admin/secrets', () => {
    expect(PUBLIC_RPC_ALLOWLIST.has('list_object_resources_page_text')).toBe(true);
    expect(PUBLIC_RPC_ALLOWLIST.has('get_object_resource')).toBe(true);
    expect(PUBLIC_RPC_ALLOWLIST.has('get_object_tourinsoft')).toBe(true);
    expect(PUBLIC_RPC_ALLOWLIST.has('get_objects_tourinsoft_batch')).toBe(true);
    expect(PUBLIC_RPC_ALLOWLIST.has('list_reference_bundle')).toBe(true);
    expect(PUBLIC_RPC_ALLOWLIST.has('list_object_markers')).toBe(true);
    // must NEVER be reachable by a partner
    expect(PUBLIC_RPC_ALLOWLIST.has('rpc_issue_partner_key')).toBe(false);
    expect(PUBLIC_RPC_ALLOWLIST.has('save_object_commercial')).toBe(false);
    expect(PUBLIC_RPC_ALLOWLIST.has('rpc_delete_object')).toBe(false);
    expect(PUBLIC_RPC_ALLOWLIST.has('get_active_ai_provider_secret')).toBe(false);
    expect(PUBLIC_RPC_ALLOWLIST.has('partner_authenticate')).toBe(false);
  });

  test('callPublicRpc rejects a non-allowlisted rpc with 400 before touching the DB', async () => {
    const r = await callPublicRpc('evil_arbitrary_rpc', {});
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'unknown_endpoint' });
  });
});

describe('admitPartner', () => {
  const rpc = jest.fn();
  const identity = { ok: true, id: '6e585305-3ced-4660-964a-062173a3ea46', label: 'Partner', scopes: ['read'] };
  const verdict = { allowed: true, retry_after: 60, limit: 120, remaining: 119 };
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSupabaseClient as jest.Mock).mockReturnValue({ schema: jest.fn().mockReturnValue({ rpc }) });
    rpc.mockResolvedValue({ data: { ...identity, rate: verdict }, error: null });
  });
  test.each([null, undefined, '', 'Bearer broken'])('rejects absent/malformed key %s before RPC', async (header) => {
    expect(await admitPartner(header)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  test('uses one RPC with only the hash and quota parameters', async () => {
    expect(await admitPartner(`Bearer ${VALID}`)).toEqual({
      partner: { keyId: identity.id, label: identity.label, scopes: ['read'] },
      rate: { allowed: true, retryAfter: 60, limit: 120, remaining: 119 },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('partner_admit', { p_key_hash: hashPartnerKey(VALID), p_limit: 120, p_window_seconds: 60 });
  });
  test('preserves denied quota verdict and custom limits', async () => {
    rpc.mockResolvedValue({ data: { ...identity, rate: { allowed: false, retry_after: 7, limit: 2, remaining: 0 } } });
    expect((await admitPartner(VALID, 2, 10))?.rate).toEqual({ allowed: false, retryAfter: 7, limit: 2, remaining: 0 });
  });
  test.each([{ ok: false }, null, [], { ...identity, id: 1 }, { ...identity, scopes: [1] }, { ...identity, label: null }])(
    'fails closed for rejected or malformed identities %p', async (data) => {
      rpc.mockResolvedValue({ data, error: null });
      expect(await admitPartner(VALID)).toBeNull();
    },
  );
  test.each([null, {}, { ...verdict, remaining: NaN }, { ...verdict, remaining: -1 }, { ...verdict, allowed: 'true' }])(
    'fails open for malformed quota only after verified identity %p', async (rate) => {
      rpc.mockResolvedValue({ data: { ...identity, rate }, error: null });
      expect((await admitPartner(VALID))?.rate).toEqual({ allowed: true, retryAfter: 0, limit: 120, remaining: 120 });
    },
  );
  test('fails closed for RPC errors and missing server', async () => {
    rpc.mockResolvedValue({ data: { ...identity, rate: verdict }, error: { message: 'auth failed' } });
    expect(await admitPartner(VALID)).toBeNull();
    rpc.mockRejectedValue(new Error('network'));
    expect(await admitPartner(VALID)).toBeNull();
    (getServerSupabaseClient as jest.Mock).mockReturnValue(null);
    expect(await admitPartner(VALID)).toBeNull();
  });
  test('rechecks identity on each request, including immediate revocation/expiry', async () => {
    expect(await admitPartner(VALID)).not.toBeNull();
    rpc.mockResolvedValue({ data: { ok: false }, error: null });
    expect(await admitPartner(VALID)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
