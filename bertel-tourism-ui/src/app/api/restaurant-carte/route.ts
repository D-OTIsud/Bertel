import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticated } from '../_document-auth';
import { readBoundedJson, BodyTooLargeError } from '@/lib/request-body.server';
import { callerRpc, failure, json, performCarteMutation, OBJECT_ID_SHAPE } from './_shared';
export const runtime = 'nodejs';
const nullableDate = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/).or(z.literal('')).nullable();
const payload = z.object({
  write_contract: z.literal('restaurant-carte-v1'),
  action: z.enum(['publish', 'metadata', 'remove', 'link-existing']),
  document_id: z.string().uuid().nullable().optional(),
  upload_id: z.string().uuid().optional(),
  expected: z.record(z.unknown()).nullable().optional(),
  patch: z.object({ title: z.string().max(180).nullable().optional(), valid_from: nullableDate.optional(),
    valid_to: nullableDate.optional(), position: z.number().int().min(1).max(10000).optional() }).strict().optional(),
}).strict();
const request = z.object({ objectId: z.string().regex(OBJECT_ID_SHAPE), requestId: z.string().uuid(), payload }).strict();
export async function GET(req: NextRequest) {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  const objectId = req.nextUrl.searchParams.get('object_id');
  if (!objectId || !OBJECT_ID_SHAPE.test(objectId)) return json({ error: 'invalid_fields' }, 400);
  try { return json({ cartes: await callerRpc(auth, 'read_restaurant_cartes', { p_object_id: objectId }) }); }
  catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  let body: z.infer<typeof request>;
  try { body = request.parse(await readBoundedJson(req, 24 * 1024)); }
  catch (error) { return json({ error: error instanceof BodyTooLargeError ? 'request_body_too_large' : 'invalid_fields' }, error instanceof BodyTooLargeError ? 413 : 400); }
  try { return json(await performCarteMutation(auth, body.objectId, body.requestId, body.payload)); }
  catch (error) { return failure(error, { requestId: body.requestId }); }
}
