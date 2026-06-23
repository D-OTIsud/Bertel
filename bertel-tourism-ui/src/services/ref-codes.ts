// Phase 7.5 — service de l'éditeur de référentiels (ref_code). Lectures directes
// (ref_code / RPC liste, public-read) ; écritures via les RPC SECURITY DEFINER gated
// super-admin (rpc_upsert/set_active/reorder_ref_code). Aucune écriture PostgREST directe
// sur ref_* (RLS admin-only) — c'est l'invariant de la phase 7.5.

import { getSupabaseClient } from '../lib/supabase';

export interface RefDomain {
  domain: string;
  label: string;
  nValues: number;
  nActive: number;
}

export interface RefValue {
  id: string;
  code: string;
  name: string;
  position: number | null;
  isActive: boolean;
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible.');
  }
  return client;
}

/** Domaines ref_code ÉDITABLES (non structurels) + compteurs, pour le maître. */
export async function listRefCodeDomains(): Promise<RefDomain[]> {
  const { data, error } = await requireClient().schema('api').rpc('list_ref_code_domains');
  if (error) throw new Error(error.message);
  return ((data as Array<Record<string, unknown>>) ?? []).map((d) => ({
    domain: String(d.domain),
    label: String(d.label),
    nValues: Number(d.n_values ?? 0),
    nActive: Number(d.n_active ?? 0),
  }));
}

/** Valeurs d'un domaine (lecture directe, ordonnées par position). */
export async function listRefCodeValues(domain: string): Promise<RefValue[]> {
  const { data, error } = await requireClient()
    .from('ref_code')
    .select('id, code, name, position, is_active')
    .eq('domain', domain)
    .order('position', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as Array<Record<string, unknown>>) ?? []).map((r) => ({
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    position: r.position == null ? null : Number(r.position),
    isActive: Boolean(r.is_active),
  }));
}

/** Crée (id absent ⇒ code requis, verrouillé) ou édite (libellé) une valeur. */
export async function upsertRefCode(input: {
  domain: string;
  name: string;
  id?: string;
  code?: string;
  position?: number;
}): Promise<string> {
  const { data, error } = await requireClient().schema('api').rpc('rpc_upsert_ref_code', {
    p_domain: input.domain,
    p_name: input.name,
    p_id: input.id ?? null,
    p_code: input.code ?? null,
    p_name_i18n: null,
    p_position: input.position ?? null,
  });
  if (error) throw new Error(error.message);
  return String((data as Record<string, unknown>)?.id ?? '');
}

/** (Dés)active une valeur. */
export async function setRefCodeActive(id: string, domain: string, active: boolean): Promise<void> {
  const { error } = await requireClient().schema('api').rpc('rpc_set_ref_code_active', {
    p_id: id,
    p_domain: domain,
    p_active: active,
  });
  if (error) throw new Error(error.message);
}

/** Réordonne les valeurs (position = rang dans `ids`). */
export async function reorderRefCode(domain: string, ids: string[]): Promise<void> {
  const { error } = await requireClient().schema('api').rpc('rpc_reorder_ref_code', {
    p_domain: domain,
    p_ids: ids,
  });
  if (error) throw new Error(error.message);
}
