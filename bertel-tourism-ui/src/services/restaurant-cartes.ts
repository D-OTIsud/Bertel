import { getApiClient } from '../lib/supabase';
import type { CarteDocument } from './object-cartes';

export interface RestaurantCarte extends CarteDocument {
  expected: Record<string, unknown>;
  publicAvailable: boolean;
}
export interface RestaurantCarteUpload {
  uploadId: string; filename: string; mimeType: string; state: 'reserved' | 'staged' | 'copied';
}
export interface RestaurantCartePayload {
  write_contract: 'restaurant-carte-v1';
  action: 'publish' | 'metadata' | 'remove' | 'link-existing';
  document_id?: string | null;
  upload_id?: string;
  expected?: Record<string, unknown> | null;
  patch?: { title?: string | null; valid_from?: string | null; valid_to?: string | null; position?: number };
}
export class RestaurantCarteError extends Error {
  constructor(message: string, readonly code: string, readonly requestId: string | null, readonly status: number) { super(message); }
}
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === 'string' ? v : '';
async function token() {
  const client = getApiClient();
  if (!client) throw new RestaurantCarteError('Le service est indisponible.', 'unavailable', null, 503);
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) throw new RestaurantCarteError('Reconnectez-vous pour continuer.', 'unauthenticated', null, 401);
  return data.session.access_token;
}
function message(code: string) {
  if (code === 'forbidden') return 'Cette carte ne peut plus être modifiée depuis votre compte.';
  if (code === 'conflict') return 'La carte a changé. Consultez sa version actuelle avant de reprendre.';
  if (code === 'invalid_fields') return 'Vérifiez les informations de la carte.';
  if (code === 'size' || code === 'request_body_too_large') return 'Le fichier dépasse la taille autorisée.';
  if (code === 'mime' || code === 'decode') return 'Choisissez un PDF ou une image JPG, PNG ou WebP valide.';
  return 'Le résultat n’a pas pu être confirmé. Votre saisie est conservée ; retrouvez l’opération avant de recommencer.';
}
async function request(path: string, init: RequestInit, requestId: string | null = null) {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { Authorization: 'Bearer ' + await token(), ...init.headers } });
  } catch (error) {
    if (error instanceof RestaurantCarteError) throw error;
    throw new RestaurantCarteError(message('operation_uncertain'), 'operation_uncertain', requestId, 503);
  }
  let data: Record<string, unknown>;
  try { data = rec(await response.json()); }
  catch { throw new RestaurantCarteError(message('operation_uncertain'), 'operation_uncertain', requestId, 503); }
  if (!response.ok) {
    const code = str(data.error) || 'unavailable';
    throw new RestaurantCarteError(message(code), code, str(data.requestId) || str(data.uploadId) || requestId, response.status);
  }
  return data;
}
function parseCartes(data: unknown): RestaurantCarte[] {
  if (!Array.isArray(data)) throw new RestaurantCarteError(message('unavailable'), 'unavailable', null, 503);
  return data.map(rec).map(row => ({
    documentId: str(row.documentId), url: str(row.url), title: str(row.title),
    validFrom: str(row.validFrom), validTo: str(row.validTo), position: Number(row.position) || 1,
    expected: rec(row.expected), publicAvailable: row.publicAvailable === true,
  }));
}
export function createRestaurantCarteRequestId() { return globalThis.crypto.randomUUID(); }
export async function listRestaurantCartes(objectId: string) {
  const data = await request('/api/restaurant-carte?object_id=' + encodeURIComponent(objectId), { method: 'GET', cache: 'no-store' });
  return parseCartes(data.cartes);
}
/** Keep requestId with the chosen file; retries must reuse it until the result is known. */
export async function uploadRestaurantCarte(objectId: string, file: File, requestId: string): Promise<RestaurantCarteUpload> {
  const form = new FormData();
  form.append('object_id', objectId); form.append('request_id', requestId); form.append('file', file);
  const data = await request('/api/restaurant-carte/upload', { method: 'POST', body: form }, requestId);
  return { uploadId: str(data.uploadId), filename: str(data.filename), mimeType: str(data.mimeType), state: data.state as RestaurantCarteUpload['state'] };
}
export async function previewRestaurantCarte(uploadId: string) {
  const data = await request('/api/restaurant-carte/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId }) }, uploadId);
  if (!str(data.url)) throw new RestaurantCarteError(message('unavailable'), 'unavailable', uploadId, 503);
  return str(data.url);
}
export async function mutateRestaurantCarte(objectId: string, requestId: string, payload: RestaurantCartePayload) {
  const data = await request('/api/restaurant-carte', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectId, requestId, payload }) }, requestId);
  return parseCartes(data.cartes);
}
export async function restaurantCarteOperation(kind: 'upload' | 'mutation', id: string) {
  return request('/api/restaurant-carte/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id }) }, id);
}
