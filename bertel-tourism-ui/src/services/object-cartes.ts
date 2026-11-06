/**
 * §06 P3 — restaurant « cartes PDF » service (object_document, role 'carte').
 *
 * Immediate-write pattern (like media uploads), NOT the save-bar module system: the file is uploaded
 * by DocumentUploadField (→ /api/document/upload → ref_document), then the caller LINKS it here.
 * Title + validity live on the link. Reads retain their existing RLS scope;
 * writes use the atomic card contract with the exact baseline seen by the editor.
 */
import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { mutateRestaurantCarte, restaurantCarteOperation, type RestaurantCartePayload } from './restaurant-cartes';
import { withPendingCarteRequest } from './carte-save-request';

export interface CarteDocument {
  documentId: string;
  url: string;
  title: string;
  validFrom: string;
  validTo: string;
  position: number;
  expected?: Record<string, unknown>;
  readId?: string;
}

const readIds = new Map<string, string>();
const readKey = (objectId: string) => `${useSessionStore.getState().userId ?? ''}:${objectId}`;

function readStr(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

/** The ref_code id of the 'carte' document role (object_document.role_id). */
async function carteRoleId(client: NonNullable<ReturnType<typeof getSupabaseClient>>): Promise<string | null> {
  const { data, error } = await client.from('ref_code').select('id').eq('domain', 'document_type').eq('code', 'carte').maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id?: string } | null)?.id ?? null;
}

/** Current PDF cartes of the object, ordered by position. url/title fall back to ref_document. */
export async function listObjectCartes(objectId: string): Promise<CarteDocument[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Connexion backend indisponible.');
  const roleId = await carteRoleId(client);
  if (!roleId) throw new Error('Le service de cartes est indisponible.');
  const { data, error } = await client
    .from('object_document')
    .select('object_id, document_id, role_id, title, valid_from, valid_to, position, ref_document(url, title, access_scope, valid_from, valid_to, storage_bucket, storage_path)')
    .eq('object_id', objectId)
    .eq('role_id', roleId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  const readId = crypto.randomUUID();
  readIds.set(readKey(objectId), readId);
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
      readId,
      expected: {
        object_id: row.object_id, document_id: row.document_id, role_id: row.role_id,
        title: row.title, valid_from: row.valid_from, valid_to: row.valid_to, position: row.position,
        document: Object.fromEntries(['url', 'title', 'access_scope', 'valid_from', 'valid_to', 'storage_bucket', 'storage_path'].map(key => [key, doc[key] ?? null])),
      },
    };
  });
}

async function mutate(objectId: string, payload: RestaurantCartePayload, readId?: string): Promise<CarteDocument[]> {
  const userId = useSessionStore.getState().userId;
  if (!userId) throw new Error('Reconnectez-vous pour enregistrer la carte.');
  await withPendingCarteRequest(userId, objectId, payload as unknown as Record<string, unknown>, async request => {
    const { request_id, ...body } = request;
    return mutateRestaurantCarte(objectId, String(request_id), body as unknown as RestaurantCartePayload);
  }, rows => { if (!Array.isArray(rows)) throw new Error('Le résultat de la carte ne peut pas être confirmé.'); }, {
    baselineReadId: readId ?? readIds.get(readKey(objectId)),
    resolve: async id => {
      const operation = await restaurantCarteOperation('mutation', id);
      return operation.state === 'committed' ? [] : null;
    },
  });
  // A receipt can describe an older commit. Always reload today's authorized view.
  return listObjectCartes(objectId);
}

function expectedCarte(objectId: string, documentId: string, carte?: CarteDocument) {
  if (carte?.expected?.object_id !== objectId || carte.expected.document_id !== documentId) {
    throw new Error('Rechargez les cartes avant de les modifier ; votre saisie est conservée.');
  }
  return carte.expected;
}

/** Office-only attachment of an already uploaded public document; no destructive replacement. */
export async function linkObjectCarte(objectId: string, documentId: string, position?: number): Promise<CarteDocument[]> {
  return mutate(objectId, { write_contract: 'restaurant-carte-v1', action: 'link-existing', document_id: documentId,
    ...(position === undefined ? {} : { patch: { position } }) });
}

/** Detach a carte from the object (the ref_document file is left for a later GC sweep). */
export async function unlinkObjectCarte(objectId: string, documentId: string, carte?: CarteDocument): Promise<CarteDocument[]> {
  return mutate(objectId, { write_contract: 'restaurant-carte-v1', action: 'remove', document_id: documentId,
    expected: expectedCarte(objectId, documentId, carte) }, carte?.readId);
}

/** Edit a carte's editor label and/or validity window (de quand à quand) on the link. */
export async function updateObjectCarte(
  objectId: string,
  documentId: string,
  patch: { title?: string; validFrom?: string; validTo?: string },
  carte?: CarteDocument,
): Promise<CarteDocument[] | undefined> {
  const update: NonNullable<RestaurantCartePayload['patch']> = {};
  if (patch.title !== undefined) update.title = patch.title || null;
  if (patch.validFrom !== undefined) update.valid_from = patch.validFrom || null;
  if (patch.validTo !== undefined) update.valid_to = patch.validTo || null;
  if (Object.keys(update).length === 0) return;
  return mutate(objectId, { write_contract: 'restaurant-carte-v1', action: 'metadata', document_id: documentId,
    expected: expectedCarte(objectId, documentId, carte), patch: update }, carte?.readId);
}
