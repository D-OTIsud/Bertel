import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticated } from '../../../_document-auth';
import { json,failure } from '../../../restaurant-carte/_shared';
import { readBoundedJson,BodyTooLargeError } from '@/lib/request-body.server';
import { extractionRpc } from '../_shared';
export const runtime='nodejs';
const input=z.object({requestId:z.string().uuid(),expectedVersion:z.number().int().min(0),draft:z.record(z.unknown())}).strict();
export async function POST(req:NextRequest){
 const auth=await authenticated(req);if(!auth.ok)return auth.response;
 let body:z.infer<typeof input>;
 try{body=input.parse(await readBoundedJson(req,1024*1024+2048));}
 catch(error){return json({error:error instanceof BodyTooLargeError?'request_body_too_large':'invalid_fields'},error instanceof BodyTooLargeError?413:400);}
 try{return json(await extractionRpc(auth,'save_menu_extraction_draft',{p_request_id:body.requestId,p_expected_version:body.expectedVersion,p_draft:body.draft}));}
 catch(error){return failure(error,{requestId:body.requestId});}
}
