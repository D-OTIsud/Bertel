import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticated } from '../../../_document-auth';
import { json,failure } from '../../../restaurant-carte/_shared';
import { readBoundedJson,BodyTooLargeError } from '@/lib/request-body.server';
import { extractionRpc } from '../_shared';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const auth=await authenticated(req);if(!auth.ok)return auth.response;
 const objectId=new URL(req.url).searchParams.get('object_id');
 if(!objectId||!/^[A-Z]{3}[A-Z0-9]{13}$/.test(objectId))return json({error:'invalid_fields'},400);
 try{return json({operations:await extractionRpc(auth,'list_menu_extractions',{p_object_id:objectId})});}
 catch(error){return failure(error);}
}
const input=z.object({requestId:z.string().uuid()}).strict();
export async function POST(req:NextRequest){
 const auth=await authenticated(req);if(!auth.ok)return auth.response;
 let body:z.infer<typeof input>;
 try{body=input.parse(await readBoundedJson(req,2048));}
 catch(error){return json({error:error instanceof BodyTooLargeError?'request_body_too_large':'invalid_fields'},error instanceof BodyTooLargeError?413:400);}
 try{return json(await extractionRpc(auth,'get_menu_extraction',{p_request_id:body.requestId}));}
 catch(error){return failure(error);}
}
