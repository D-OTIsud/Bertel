/**
 * §06 P3 — restaurant « cartes PDF » service (object_document, role 'carte').
 *
 * Immediate-write pattern (like media uploads), NOT the save-bar module system: the file is uploaded
 * by DocumentUploadField (→ /api/document/upload → ref_document), then the caller LINKS it here.
 * Title + validity live on the object_document link (ref_document is admin-write); url comes from
 * ref_document (public read). All writes go through the per-command `canonical_*` RLS on object_document.
 */
import { getSupabaseClient } from '../lib/supabase';

export interface CarteDocument {
  documentId: string;
  url: string;
  title: string;
  validFrom: string;
  validTo: string;
  position: number;
}

function readStr(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

/** The ref_code id of the 'carte' document role (object_document.role_id). */
async function carteRoleId(client: NonNullable<ReturnType<typeof getSupabaseClient>>): Promise<string | null> {
  const { data } = await client.from('ref_code').select('id').eq('domain', 'document_type').eq('code', 'carte').maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/** Current PDF cartes of the object, ordered by position. url/title fall back to ref_document. */
export async function listObjectCartes(objectId: string): Promise<CarteDocument[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const roleId = await carteRoleId(client);
  if (!roleId) return [];
  const { data, error } = await client
    .from('object_document')
    .select('document_id, title, valid_from, valid_to, position, ref_document(url, title)')
    .eq('object_id', objectId)
    .eq('role_id', roleId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const doc = (row.ref_document ?? {}) as Record<string, unknown>;
    return {
      documentId: readStr(row.document_id),
      url: readStr(doc.url),
      title: readStr(row.title) || readStr(doc.title),
      validFrom: readStr(row.valid_from),
      validTo: readStr(row.valid_to),
      position: typeof row.position === 'number' ? row.position : Number(row.position) || 1,
    };
  });
}

/** Link an already-uploaded ref_document to the object as a 'carte'. */
export async function linkObjectCarte(objectId: string, documentId: string, position: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Connexion backend indisponible.');
  const roleId = await carteRoleId(client);
  const { error } = await client.from('object_document').insert({
    object_id: objectId,
    document_id: documentId,
    role_id: roleId,
    position,
  });
  if (error) throw new Error(error.message);
}

/** Detach a carte from the object (the ref_document file is left for a later GC sweep). */
export async function unlinkObjectCarte(objectId: string, documentId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Connexion backend indisponible.');
  const { error } = await client.from('object_document').delete().eq('object_id', objectId).eq('document_id', documentId);
  if (error) throw new Error(error.message);
}

/** Edit a carte's editor label and/or validity window (de quand à quand) on the link. */
export async function updateObjectCarte(
  objectId: string,
  documentId: string,
  patch: { title?: string; validFrom?: string; validTo?: string },
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Connexion backend indisponible.');
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title || null;
  if (patch.validFrom !== undefined) update.valid_from = patch.validFrom || null;
  if (patch.validTo !== undefined) update.valid_to = patch.validTo || null;
  if (Object.keys(update).length === 0) return;
  const { error } = await client.from('object_document').update(update).eq('object_id', objectId).eq('document_id', documentId);
  if (error) throw new Error(error.message);
}
