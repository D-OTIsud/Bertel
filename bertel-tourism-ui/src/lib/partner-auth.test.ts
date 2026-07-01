jest.mock('server-only', () => ({}));

import { extractPartnerKey, hashPartnerKey } from './partner-auth';
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
