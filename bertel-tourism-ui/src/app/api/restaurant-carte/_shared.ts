import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { callerClient, UUID_SHAPE, type AuthenticatedRequest } from '../_document-auth';
import { processImage, MediaProcessingError } from '../media/upload/process-image';
import { validateDocument } from '../document/upload/process-document';

export const CARTE_STAGING_BUCKET = 'restaurant-cartes-private';
export const CARTE_PUBLIC_BUCKET = 'documents';
export const MAX_CARTE_BYTES = 10 * 1024 * 1024;
export const OBJECT_ID_SHAPE = /^[A-Z]{3}[A-Z0-9]{13}$/;
export type CarteAuth = Extract<AuthenticatedRequest, { ok: true }>;
export type RecordValue = Record<string, unknown>;
export const record = (value: unknown): RecordValue | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
export class CarteRouteError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
export function rpcError(error: unknown): CarteRouteError {
  const code = record(error)?.code;
  if (code === '42501') return new CarteRouteError('forbidden', 403);
  if (code === 'PT409' || code === '23505') return new CarteRouteError('conflict', 409);
  if (code === '22023' || code === '22007' || code === '22008') return new CarteRouteError('invalid_fields', 400);
  return new CarteRouteError('unavailable', 503);
}
export function failure(error: unknown, extra: RecordValue = {}) {
  if (error instanceof CarteRouteError) return json({ error: error.code, ...extra }, error.status);
  if (error instanceof MediaProcessingError) return json({ error: error.code, ...extra }, error.code === 'size' ? 413 : 415);
  return json({ error: 'unavailable', ...extra }, 503);
}
export interface CarteUploadReceipt {
  id: string; objectId: string; documentId: string; filename: string;
  sha256: string; byteSize: number; mimeType: 'application/pdf' | 'image/jpeg';
  state: 'reserved' | 'staged' | 'copied';
  stagingBucket: typeof CARTE_STAGING_BUCKET; stagingPath: string;
  publicBucket: typeof CARTE_PUBLIC_BUCKET; publicPath: string; publicUrl: string | null;
}
export function parseReceipt(value: unknown): CarteUploadReceipt {
  const row = record(value);
  if (!row || typeof row.id !== 'string' || !UUID_SHAPE.test(row.id)
    || typeof row.objectId !== 'string' || !OBJECT_ID_SHAPE.test(row.objectId)
    || typeof row.documentId !== 'string' || !UUID_SHAPE.test(row.documentId)
    || typeof row.filename !== 'string' || row.filename.length < 1 || row.filename.length > 180
    || typeof row.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.sha256)
    || typeof row.byteSize !== 'number' || !Number.isInteger(row.byteSize) || row.byteSize < 1 || row.byteSize > MAX_CARTE_BYTES
    || !['application/pdf', 'image/jpeg'].includes(String(row.mimeType))
    || !['reserved', 'staged', 'copied'].includes(String(row.state))
    || row.stagingBucket !== CARTE_STAGING_BUCKET || row.publicBucket !== CARTE_PUBLIC_BUCKET) {
    throw new CarteRouteError('invalid_receipt', 503);
  }
  const extension = row.mimeType === 'application/pdf' ? '.pdf' : '.jpg';
  if (row.stagingPath !== 'restaurant-cartes/' + row.objectId + '/' + row.id + extension
    || row.publicPath !== row.objectId + '/cartes/' + row.id + extension
    || (row.publicUrl !== null && typeof row.publicUrl !== 'string')) {
    throw new CarteRouteError('invalid_receipt', 503);
  }
  if (row.state === 'copied' && !validPublicUrl(row.publicUrl as string, row.publicPath as string)) {
    throw new CarteRouteError('invalid_receipt', 503);
  }
  return row as unknown as CarteUploadReceipt;
}
function validPublicUrl(value: string, path: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.pathname === '/storage/v1/object/public/documents/' + path
      && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}
export const digest = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
export async function prepareCarteBytes(file: File) {
  const isPdf = file.type === 'application/pdf';
  if (file.size > (isPdf ? MAX_CARTE_BYTES : 20 * 1024 * 1024)) {
    throw new MediaProcessingError('size', 'Fichier trop volumineux.');
  }
  const raw = Buffer.from(await file.arrayBuffer());
  if (isPdf) {
    validateDocument({ buffer: raw, mimeType: file.type });
    return { buffer: raw, mimeType: 'application/pdf' as const };
  }
  const image = await processImage({ buffer: raw, mimeType: file.type });
  if (image.buffer.byteLength > MAX_CARTE_BYTES) throw new MediaProcessingError('size', 'Image traitée trop volumineuse.');
  return { buffer: image.buffer, mimeType: 'image/jpeg' as const };
}
export async function callerRpc(auth: CarteAuth, name: string, args: RecordValue) {
  const result = await callerClient(auth.jwt).schema('api').rpc(name, args);
  if (result.error) throw rpcError(result.error);
  return result.data as unknown;
}
export async function readReceipt(auth: CarteAuth, uploadId: string) {
  return parseReceipt(await callerRpc(auth, 'get_restaurant_carte_upload', { p_upload_id: uploadId }));
}
async function verifyStoredBytes(auth: CarteAuth, bucket: string, path: string, receipt: CarteUploadReceipt) {
  const { data, error } = await auth.server.storage.from(bucket).download(path);
  if (error || !data || data.size !== receipt.byteSize || data.size > MAX_CARTE_BYTES) {
    throw new CarteRouteError('stored_file_unconfirmed', 503);
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  if (digest(buffer) !== receipt.sha256) throw new CarteRouteError('stored_file_mismatch', 409);
  if (receipt.mimeType === 'application/pdf') validateDocument({ buffer, mimeType: receipt.mimeType });
  else if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    throw new CarteRouteError('stored_file_mismatch', 409);
  }
}
export async function stageCarteBytes(auth: CarteAuth, receipt: CarteUploadReceipt, bytes: Buffer) {
  if (receipt.state !== 'reserved') return receipt;
  const uploaded = await auth.server.storage.from(CARTE_STAGING_BUCKET).upload(receipt.stagingPath, bytes, {
    contentType: receipt.mimeType, cacheControl: '0', upsert: false,
  });
  // A duplicate or lost storage acknowledgement is recovered by comparing bounded bytes.
  // Never upsert or delete a path merely because this request did not receive its result.
  if (uploaded.error) await verifyStoredBytes(auth, CARTE_STAGING_BUCKET, receipt.stagingPath, receipt);
  const staged = await auth.server.schema('api').rpc('record_restaurant_carte_staged', {
    p_upload_id: receipt.id, p_sha256: receipt.sha256,
  });
  if (staged.error) {
    const recovered = await readReceipt(auth, receipt.id);
    if (recovered.state !== 'reserved') return recovered;
    throw new CarteRouteError('upload_uncertain', 503);
  }
  return parseReceipt(staged.data);
}
export async function ensureCarteCopy(auth: CarteAuth, receipt: CarteUploadReceipt) {
  if (receipt.state === 'copied') return receipt;
  if (receipt.state !== 'staged') throw new CarteRouteError('upload_not_ready', 409);
  await verifyStoredBytes(auth, CARTE_STAGING_BUCKET, receipt.stagingPath, receipt);
  await auth.server.storage.from(CARTE_STAGING_BUCKET).copy(receipt.stagingPath, receipt.publicPath, {
    destinationBucket: CARTE_PUBLIC_BUCKET,
  });
  // The destination is immutable and request-specific. Verify both ordinary success and
  // already-existing/uncertain copy results; an arbitrary existing object is never trusted.
  await verifyStoredBytes(auth, CARTE_PUBLIC_BUCKET, receipt.publicPath, receipt);
  const { data: publicData } = auth.server.storage.from(CARTE_PUBLIC_BUCKET).getPublicUrl(receipt.publicPath);
  if (!validPublicUrl(publicData.publicUrl, receipt.publicPath)) throw new CarteRouteError('public_url_unavailable', 503);
  const copied = await auth.server.schema('api').rpc('record_restaurant_carte_copied', {
    p_upload_id: receipt.id, p_sha256: receipt.sha256, p_public_url: publicData.publicUrl,
  });
  if (copied.error) {
    const recovered = await readReceipt(auth, receipt.id);
    if (recovered.state === 'copied') return recovered;
    throw new CarteRouteError('copy_uncertain', 503);
  }
  return parseReceipt(copied.data);
}
export function confirmedResult(value: unknown): RecordValue | null {
  const row = record(value);
  return row && typeof row.requestId === 'string' && UUID_SHAPE.test(row.requestId) && Array.isArray(row.cartes) ? row : null;
}
export async function performCarteMutation(auth: CarteAuth, objectId: string, requestId: string, payload: RecordValue) {
  const prepared = record(await callerRpc(auth, 'prepare_restaurant_carte_mutation', {
    p_object_id: objectId, p_request_id: requestId, p_payload: payload,
  }));
  if (prepared?.state === 'committed') {
    const result = confirmedResult(prepared.result);
    if (!result) throw new CarteRouteError('operation_uncertain', 503);
    return result;
  }
  if (prepared?.state !== 'prepared') throw new CarteRouteError('operation_uncertain', 503);
  if (payload.action === 'publish') await ensureCarteCopy(auth, parseReceipt(prepared.upload));
  try {
    const result = confirmedResult(await callerRpc(auth, 'finalize_restaurant_carte_mutation', { p_request_id: requestId }));
    if (result) return result;
  } catch (error) {
    // A server commit can succeed despite a lost response. Check its durable receipt before
    // reporting uncertainty. No compensation is performed on either a conflict or a timeout.
    const status = record(await callerRpc(auth, 'get_restaurant_carte_mutation', { p_request_id: requestId }).catch(() => null));
    const result = status?.state === 'committed' ? confirmedResult(status.result) : null;
    if (result) return result;
    if (error instanceof CarteRouteError && error.status < 500) throw error;
  }
  throw new CarteRouteError('operation_uncertain', 503);
}
