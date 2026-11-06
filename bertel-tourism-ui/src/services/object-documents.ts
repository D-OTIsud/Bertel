import { readTrimmedString as readString } from '../lib/json-read';
import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { isPrivateObjectDocumentHref } from '../lib/object-document-location';
import { apiError } from './api-error';

export type ObjectDocumentCategory = 'legal' | 'classification';

export interface ObjectDocument {
  id: string;
  title: string;
  url: string;
  requiresSigning?: boolean;
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

function readNullableString(value: unknown): string | null {
  const text = readString(value);
  return text || null;
}

function normalizeDocument(value: unknown): ObjectDocument | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = readString(row.document_id);
  const url = readString(row.url);
  const requiresSigning = row.requires_signing === true || isPrivateObjectDocumentHref(url);
  if (!id || (!url && !requiresSigning)) return null;

  return {
    id,
    title: readString(row.title) || 'Document sans titre',
    url: requiresSigning ? '' : url,
    requiresSigning,
    category: row.category === 'classification' ? 'classification' : 'legal',
    typeCode: readString(row.type_code),
    issuer: readString(row.issuer),
    validFrom: readNullableString(row.valid_from),
    validTo: readNullableString(row.valid_to),
    createdAt: readNullableString(row.created_at),
  };
}

/** A fresh, object-scoped authorization for each opening; signed URLs are never cached. */
export async function getObjectDocumentUrl(objectId: string, documentId: string, signal?: AbortSignal, accessContext: 'canonical' | 'legal' = 'canonical'): Promise<string> {
  const client = getSupabaseClient();
  const session = client ? await client.auth.getSession() : null;
  const token = session?.data.session?.access_token;
  if (!token) throw new Error('Votre session est indisponible. Reconnectez-vous.');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const response = await fetch('/api/object-document/url', {
    method: 'POST', cache: 'no-store', signal,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectId, documentId, ...(accessContext === 'legal' ? { accessContext } : {}) }),
  });
  if (!response.ok) throw await apiError(response);
  const payload = await response.json() as { url?: unknown };
  if (typeof payload.url !== 'string') throw new Error('Le lien de téléchargement est indisponible.');
  const url = new URL(payload.url);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Le lien de téléchargement est indisponible.');
  }
  return url.href;
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
