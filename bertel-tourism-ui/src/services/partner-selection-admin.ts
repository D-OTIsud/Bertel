import { getApiClient } from '../lib/supabase';

export type PartnerSelectionState = 'active' | 'suspended';
export interface SavedSelectionBucket {
  types: readonly string[];
  filters?: Record<string, unknown>;
  search?: string | null;
  only_without_practices?: boolean;
}
export interface PartnerSelectionAdmin {
  id: string;
  orgObjectId: string;
  name: string;
  buckets: SavedSelectionBucket[];
  explorerState: Record<string, unknown> | null;
  communeInsee: string[] | null;
  state: PartnerSelectionState;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface PartnerSelectionInput {
  name: string;
  buckets: readonly SavedSelectionBucket[];
  orgObjectId?: string;
  explorerState?: Record<string, unknown> | null;
  communeInsee?: readonly string[] | null;
}

function client() {
  const c = getApiClient();
  if (!c) throw new Error('Connexion backend indisponible.');
  return c.schema('api');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Réponse de sélection invalide.');
  return value as Record<string, unknown>;
}
function decode(value: unknown): PartnerSelectionAdmin {
  const row = record(value);
  if (typeof row.id !== 'string' || typeof row.org_object_id !== 'string' || typeof row.name !== 'string'
    || !Array.isArray(row.buckets) || (row.state !== 'active' && row.state !== 'suspended')
    || typeof row.revision !== 'number' || !Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error('Réponse de sélection invalide.');
  }
  const buckets = row.buckets.map((value) => {
    const b = record(value);
    if (!Array.isArray(b.types) || b.types.length === 0 || !b.types.every((t) => typeof t === 'string')) {
      throw new Error('Critères de sélection invalides.');
    }
    return b as unknown as SavedSelectionBucket;
  });
  if (row.commune_insee !== null && (!Array.isArray(row.commune_insee)
    || !row.commune_insee.every((v) => typeof v === 'string'))) throw new Error('Communes de sélection invalides.');
  return {
    id: row.id, orgObjectId: row.org_object_id, name: row.name, buckets,
    explorerState: row.explorer_state == null ? null : record(row.explorer_state),
    communeInsee: row.commune_insee as string[] | null, state: row.state,
    revision: row.revision, createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? ''),
  };
}
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client().rpc(name, args);
  if (error) {
    if (error.code === 'PT409') throw new Error('La sélection a changé. Rechargez-la avant de réessayer.');
    if (error.code === '42501') throw new Error('Gestion réservée aux administrateurs de cette organisation.');
    if (error.code === 'PT400') throw new Error('Les critères de la sélection sont invalides.');
    throw new Error('La sélection ne peut pas être chargée ou enregistrée.');
  }
  return data;
}
export async function listPartnerSelections(orgObjectId?: string): Promise<PartnerSelectionAdmin[]> {
  const rows = await rpc('list_partner_selections', { p_org_object_id: orgObjectId ?? null });
  if (!Array.isArray(rows)) throw new Error('Liste de sélections invalide.');
  return rows.map(decode);
}
export async function getPartnerSelectionAdmin(id: string): Promise<PartnerSelectionAdmin> {
  return decode(await rpc('get_partner_selection', { p_selection_id: id }));
}
export async function createPartnerSelection(input: PartnerSelectionInput): Promise<PartnerSelectionAdmin> {
  return decode(await rpc('create_partner_selection', {
    p_name: input.name, p_buckets: input.buckets, p_org_object_id: input.orgObjectId ?? null,
    p_explorer_state: input.explorerState ?? null, p_commune_insee: input.communeInsee ?? null,
  }));
}
export async function updatePartnerSelection(id: string, expectedRevision: number, input: PartnerSelectionInput): Promise<PartnerSelectionAdmin> {
  return decode(await rpc('update_partner_selection', {
    p_selection_id: id, p_expected_revision: expectedRevision, p_name: input.name, p_buckets: input.buckets,
    p_explorer_state: input.explorerState ?? null, p_commune_insee: input.communeInsee ?? null,
  }));
}
export async function setPartnerSelectionState(id: string, expectedRevision: number, state: PartnerSelectionState): Promise<PartnerSelectionAdmin> {
  return decode(await rpc('set_partner_selection_state', { p_selection_id: id, p_expected_revision: expectedRevision, p_state: state }));
}
export async function preparePartnerSelectionPreview(input: PartnerSelectionInput): Promise<Record<string, unknown>> {
  return record(await rpc('prepare_partner_selection_preview', {
    p_buckets: input.buckets, p_org_object_id: input.orgObjectId ?? null,
    p_commune_insee: input.communeInsee ?? null, p_name: input.name || 'Aperçu',
  }));
}

export interface PartnerSelectionPreview {
  meta: { total: number; next_cursor: string | null; page_size?: number; preview: true };
  data: Record<string, unknown>[];
}
/** Caller JWT authorizes the draft; the server then uses the public serializer. */
export async function previewPartnerSelection(
  input: PartnerSelectionInput, options: { cursor?: string | null; pageSize?: number; signal?: AbortSignal } = {},
): Promise<PartnerSelectionPreview> {
  const c = getApiClient();
  if (!c) throw new Error('Connexion backend indisponible.');
  const { data: sessionData, error: sessionError } = await c.auth.getSession();
  const token = sessionData.session?.access_token;
  if (sessionError || !token) throw new Error('Session expirée — reconnectez-vous.');
  const response = await fetch('/api/partner-selections/preview', {
    method: 'POST', cache: 'no-store', signal: options.signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: input.name.trim() || 'Aperçu', buckets: input.buckets,
      orgObjectId: input.orgObjectId ?? null, communeInsee: input.communeInsee ?? null,
      cursor: options.cursor ?? null, pageSize: options.pageSize ?? 25 }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) throw new Error('Session expirée — reconnectez-vous.');
    if (response.status === 403) throw new Error('Gestion réservée aux administrateurs de cette organisation.');
    if (response.status === 400) throw new Error('Les critères ou le curseur de l’aperçu sont invalides.');
    throw new Error('Aperçu indisponible. Les critères enregistrés sont conservés.');
  }
  const result = record(body); const meta = record(result.meta);
  if (meta.preview !== true || typeof meta.total !== 'number' || !Number.isSafeInteger(meta.total)
    || meta.total < 0 || (meta.next_cursor !== null && typeof meta.next_cursor !== 'string')
    || !Array.isArray(result.data)) throw new Error('Réponse d’aperçu invalide.');
  return { meta: meta as PartnerSelectionPreview['meta'], data: result.data.map(record) };
}
