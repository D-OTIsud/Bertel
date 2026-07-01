import 'server-only';
import { getServerSupabaseClient } from './supabase-server';

/**
 * Public-API plumbing for the partner-facing `/api/public/*` surface (audit API R1b + I2).
 *
 * Contract versioning (I2): every public response carries `meta.contract_version` and the
 * `X-Bertel-Api-Version` header. The version lives HERE (route layer), decoupled from the SQL
 * signatures — additive-only within a major; a breaking change ships under `/api/public/v2/*`.
 */
export const PUBLIC_API_CONTRACT_VERSION = '1.0.0';

/**
 * The ONLY RPCs a partner may reach — public READ endpoints that filter `status='published'`
 * internally, or are catalogs. A partner request can never invoke an arbitrary RPC: the route
 * calls `callPublicRpc` with a hard-coded name from this set (defense-in-depth allowlist).
 */
export const PUBLIC_RPC_ALLOWLIST = new Set<string>([
  'list_object_resources_page_text',
  'get_object_resource',
  'list_object_markers',
  'list_reference_bundle',
  'list_catalog',
  'public_catalog_domains',
]);

export interface PublicApiResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/** Uniform public envelope: `{ meta: { contract_version, … }, data }`. */
export function publicEnvelope(data: unknown, extraMeta: Record<string, unknown> = {}): {
  meta: Record<string, unknown>;
  data: unknown;
} {
  return { meta: { contract_version: PUBLIC_API_CONTRACT_VERSION, ...extraMeta }, data };
}

/** Response headers carried on every public response (success or error). */
export function publicHeaders(): Record<string, string> {
  return { 'X-Bertel-Api-Version': PUBLIC_API_CONTRACT_VERSION };
}

/**
 * Invoke an allowlisted public RPC service-role. Rejects anything not in the allowlist
 * (belt-and-suspenders — routes only ever pass literal names). Never leaks the service key.
 */
export async function callPublicRpc(rpcName: string, params: Record<string, unknown>): Promise<PublicApiResult> {
  if (!PUBLIC_RPC_ALLOWLIST.has(rpcName)) {
    return { ok: false, status: 400, body: { error: 'unknown_endpoint' } };
  }
  const server = getServerSupabaseClient();
  if (!server) {
    return { ok: false, status: 500, body: { error: 'server_misconfigured' } };
  }
  const { data, error } = await server.schema('api').rpc(rpcName, params);
  if (error) {
    return { ok: false, status: 502, body: { error: 'upstream_error', detail: error.message } };
  }
  return { ok: true, status: 200, body: data ?? null };
}
