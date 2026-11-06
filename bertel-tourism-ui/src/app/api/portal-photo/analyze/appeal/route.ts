import { NextResponse,type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticated,callerClient } from '../../../_document-auth';
import { readBoundedJson,BodyTooLargeError } from '@/lib/request-body.server';
export const runtime='nodejs';
const schema=z.object({requestId:z.string().uuid(),clientId:z.string().uuid(),body:z.string().trim().min(1).max(3000)}).strict();
export async function POST(req:NextRequest){
 const auth=await authenticated(req);if(!auth.ok)return auth.response;
 let input:z.infer<typeof schema>;
 try{input=schema.parse(await readBoundedJson(req,16_384));}
 catch(error){return NextResponse.json({error:error instanceof BodyTooLargeError?'request_body_too_large':'invalid_fields'},{status:error instanceof BodyTooLargeError?413:400});}
 const result=await callerClient(auth.jwt).schema('api').rpc('appeal_portal_photo_analysis',{p_request_id:input.requestId,p_body:input.body,p_client_id:input.clientId});
 if(result.error){
  const {code,message}=result.error;
  // P0001 is a generic RAISE code. Only the existing message quota is a 429.
  const quota=code==='P0001'&&message==='Limite quotidienne atteinte. Réessayez demain.';
  const status=code==='42501'?403:code==='PT409'||code==='23505'?409:code==='22023'?400:quota?429:503;
  const error=status===403?'forbidden':status===409?'conflict':status===400?'invalid_fields':quota?'quota_reached':'unavailable';
  return NextResponse.json({error},{status,headers:{'Cache-Control':'private, no-store'}});
 }
 return NextResponse.json({interactionId:result.data},{headers:{'Cache-Control':'private, no-store'}});
}
