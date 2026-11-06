import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticated } from '../../_document-auth';
import { readBoundedJson, BodyTooLargeError } from '@/lib/request-body.server';
import { CarteRouteError, CARTE_STAGING_BUCKET, failure, json, readReceipt } from '../_shared';
export const runtime='nodejs';
const request=z.object({uploadId:z.string().uuid()}).strict();
export async function POST(req:NextRequest) {
 const auth=await authenticated(req);
 if(!auth.ok)return auth.response;
 let body:z.infer<typeof request>;
 try{body=request.parse(await readBoundedJson(req,2048));}
 catch(error){return json({error:error instanceof BodyTooLargeError?'request_body_too_large':'invalid_fields'},error instanceof BodyTooLargeError?413:400);}
 try{
  const receipt=await readReceipt(auth,body.uploadId);
  if(receipt.state==='reserved')throw new CarteRouteError('upload_not_ready',409);
  const signed=await auth.server.storage.from(CARTE_STAGING_BUCKET).createSignedUrl(receipt.stagingPath,120);
  if(signed.error||!signed.data?.signedUrl)throw new CarteRouteError('preview_unavailable',503);
  return json({url:signed.data.signedUrl});
 }catch(error){return failure(error);}
}
