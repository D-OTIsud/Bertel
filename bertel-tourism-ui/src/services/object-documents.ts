import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

export type ObjectDocumentCategory = 'legal' | 'classification';

export interface ObjectDocument {
  id: string;
  title: string;
  url: string;
  category: ObjectDocumentCategory;
  typeCode: string;
  issuer: string;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string | null;
}

export interface ObjectDocumentsResult {
  authorized: boolean;
  documents: ObjectDocument[];
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown): string | null {
  const text = readString(value);
  return text || null;
}

function normalizeDocument(value: unknown): ObjectDocument | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = readString(row.document_id);
  const url = readString(row.url);
  if (!id || !url) return null;

  return {
    id,
    title: readString(row.title) || 'Document sans titre',
    url,
    category: row.category === 'classification' ? 'classification' : 'legal',
    typeCode: readString(row.type_code),
    issuer: readString(row.issuer),
    validFrom: readNullableString(row.valid_from),
    validTo: readNullableString(row.valid_to),
    createdAt: readNullableString(row.created_at),
  };
}

/**
 * Lit les justificatifs actifs d'une fiche. Le RPC rend aussi le verdict objet-scopé :
 * l'UI ne déduit jamais l'autorisation du seul rôle global de la session.
 */
export async function getActiveObjectDocuments(
  objectId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ObjectDocumentsResult> {
  const session = useSessionStore.getState();
  if (session.demoMode) return { authorized: session.canEditObjects, documents: [] };

  const client = getApiClient();
  if (!client) throw new Error('Connexion backend indisponible.');

  let query = client.schema('api').rpc('get_active_object_documents', { p_object_id: objectId });
  if (options.signal) query = query.abortSignal(options.signal);
  const { data, error } = await query;
  if (error) throw error;

  const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  return {
    authorized: payload.authorized === true,
    documents: Array.isArray(payload.documents)
      ? payload.documents.map(normalizeDocument).filter((item): item is ObjectDocument => item !== null)
      : [],
  };
}
