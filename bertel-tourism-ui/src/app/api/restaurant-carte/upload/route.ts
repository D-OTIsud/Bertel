import { type NextRequest } from 'next/server';
import { authenticated } from '../../_document-auth';
import { readBoundedFormData, assertFormDataShape, acquireLease, BodyTooLargeError } from '@/lib/request-body.server';
import { MAX_INPUT_BYTES } from '../../media/upload/process-image';
import { UUID_SHAPE } from '../../_document-auth';
import { callerRpc, failure, json, OBJECT_ID_SHAPE, parseReceipt, prepareCarteBytes, stageCarteBytes, digest } from '../_shared';

export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  const lease = acquireLease('upload');
  if (!lease) return json({ error: 'too_many_requests' }, 429);
  let requestId: string | null = null;
  try {
    let form: FormData;
    try {
      form = await readBoundedFormData(req, MAX_INPUT_BYTES + 1024 * 1024);
      assertFormDataShape(form, { allowedFields: ['object_id', 'request_id', 'file'] });
    } catch (error) {
      return json({ error: error instanceof BodyTooLargeError ? 'request_body_too_large' : 'invalid_fields' },
        error instanceof BodyTooLargeError ? 413 : 400);
    }
    const objectId = form.get('object_id'), id = form.get('request_id'), file = form.get('file');
    if (typeof objectId !== 'string' || !OBJECT_ID_SHAPE.test(objectId) || typeof id !== 'string'
      || !UUID_SHAPE.test(id) || !(file instanceof File)) return json({ error: 'invalid_fields' }, 400);
    requestId = id;
    // Object authorization happens before reading/decoding file bytes or using privileged Storage.
    await callerRpc(auth, 'read_restaurant_cartes', { p_object_id: objectId });
    const processed = await prepareCarteBytes(file);
    const receipt = parseReceipt(await callerRpc(auth, 'prepare_restaurant_carte_upload', {
      p_object_id: objectId, p_request_id: id, p_filename: file.name.trim().slice(0, 180) || 'Carte',
      p_sha256: digest(processed.buffer), p_byte_size: processed.buffer.byteLength, p_mime_type: processed.mimeType,
    }));
    const staged = await stageCarteBytes(auth, receipt, processed.buffer);
    return json({ uploadId: staged.id, filename: staged.filename, mimeType: staged.mimeType, state: staged.state }, 201);
  } catch (error) { return failure(error, requestId ? { uploadId: requestId } : {}); }
  finally { lease.release(); }
}
