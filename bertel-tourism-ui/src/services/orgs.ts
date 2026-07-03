// orgs.ts — administration des organisations (superadmin). Lecture/création via RPCs DEFINER
// superuser-only (rpc_list_orgs / rpc_create_org) — jamais de SELECT direct sur object ici.
import { getApiClient } from '../lib/supabase';

export interface OrgSummary {
  id: string;
  name: string;
  status: string;
  regionCode: string | null;
  accessScope: string | null;
  memberCount: number;
  createdAt: string | null;
}

export interface CreateOrgInput {
  name: string;
  regionCode?: string;
  accessScope?: 'own_objects_only' | 'all_published';
}

function requireClient() {
  const c = getApiClient();
  if (!c) throw new Error('Supabase non configuré.');
  return c;
}

export async function listOrgs(): Promise<OrgSummary[]> {
  const { data, error } = await requireClient().schema('api').rpc('rpc_list_orgs');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    name: String(r.name),
    status: String(r.status ?? ''),
    regionCode: (r.regionCode as string) ?? null,
    accessScope: (r.accessScope as string) ?? null,
    memberCount: typeof r.memberCount === 'number' ? r.memberCount : 0,
    createdAt: (r.createdAt as string) ?? null,
  }));
}

export async function createOrg(input: CreateOrgInput): Promise<string> {
  const { data, error } = await requireClient().schema('api').rpc('rpc_create_org', {
    p_name: input.name,
    p_region_code: input.regionCode ?? 'RUN',
    p_access_scope: input.accessScope ?? 'own_objects_only',
  });
  if (error) throw error;
  return data as string;
}

const FRIENDLY: Array<[string, string]> = [
  ['DUPLICATE_ORG', 'Une organisation de ce nom existe déjà pour cette région.'],
  ['MISSING_REQUIRED_FIELD', 'Le nom de l\'organisation est obligatoire.'],
  ['INVALID_ACCESS_SCOPE', 'Périmètre d\'accès invalide.'],
  ['FORBIDDEN', 'Action réservée au superadmin plateforme.'],
];

export function friendlyOrgError(err: { message?: string } | null | undefined): string {
  const msg = err?.message ?? '';
  for (const [code, friendly] of FRIENDLY) if (msg.includes(code)) return friendly;
  return msg || 'Action impossible.';
}
