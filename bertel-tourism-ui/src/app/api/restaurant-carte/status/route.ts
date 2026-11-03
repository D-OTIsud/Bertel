import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticated } from '../../_document-auth';
import { readBoundedJson, BodyTooLargeError } from '@/lib/request-body.server';
import { callerRpc, failure, json, readReceipt } from '../_shared';
export const runtime = 'nodejs';
const request = z.object({ kind: z.enum(['upload','mutation']), id: z.string().uuid() }).strict();
export async function POST(req: NextRequest) {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  let body: z.infer<typeof request>;
  try { body=request.parse(await readBoundedJson(req, 2048)); }
  catch (error) { return json({error:error instanceof BodyTooLargeError?'request_body_too_large':'invalid_fields'},error instanceof BodyTooLargeError?413:400); }
  try {
    if(body.kind==='mutation') return json(await callerRpc(auth,'get_restaurant_carte_mutation',{p_request_id:body.id}));
    const receipt=await readReceipt(auth,body.id);
    return json({uploadId:receipt.id,filename:receipt.filename,mimeType:receipt.mimeType,state:receipt.state});
  } catch(error) { return failure(error); }
}
