import { createHash, randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticated, callerClient, PRIVATE_BUCKET } from '../../_document-auth';
import { readBoundedJson, BodyTooLargeError, acquireLease } from '@/lib/request-body.server';
import { callVisionExtraction } from '../../menu/extract/provider';
import { failedPhotoAssessment, parsePhotoAssessment, photoAssessmentPrompt } from './assessment';

export const runtime='nodejs';
export const maxDuration=60;
const bodySchema=z.object({objectId:z.string().regex(/^[A-Z]{3}[A-Z0-9]{13}$/),documentId:z.string().uuid(),requestId:z.string().uuid()}).strict();
const providerSchema=z.object({id:z.string().uuid(),api_kind:z.literal('openai_compatible'),base_url:z.string().url().refine(value=>/^https?:\/\//i.test(value)),model:z.string().min(1),max_output_tokens:z.number().int().min(256).max(32768),extra:z.record(z.unknown()).nullable(),api_key:z.string().nullable()});
const rec=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const operationStatus=(operation:Record<string,unknown>)=>operation.state==='unavailable'?503:['reserved','started','uncertain'].includes(String(operation.state))?202:200;
const failure=(error:{code?:string}|null,operationId?:string)=>{
 const code=error?.code;
 const status=code==='42501'?403:code==='PT409'||code==='23505'?409:code==='22023'||code==='22P02'?400:503;
 return json({...(operationId?{requestId:operationId,...failedPhotoAssessment(false)}:{}),
  error:status===403?'forbidden':status===409?'conflict':status===400?'invalid_fields':'unavailable'},status);
};

export async function POST(req:NextRequest){
 const deadline=Date.now()+55_000;
 const auth=await authenticated(req);if(!auth.ok)return auth.response;
 let body:z.infer<typeof bodySchema>;
 try{body=bodySchema.parse(await readBoundedJson(req,4096));}
 catch(error){return json({error:error instanceof BodyTooLargeError?'request_body_too_large':'invalid_fields'},error instanceof BodyTooLargeError?413:400);}
 const caller=callerClient(auth.jwt).schema('api');
 let operationId:string|null=null,claimId:string|null=null,started=false,startUnconfirmed=false,createdReservation=false;
 let lease:ReturnType<typeof acquireLease>|null=null;
 const cancelCreatedReservation=async()=>{
  if(!operationId||!createdReservation||started||startUnconfirmed)return;
  await auth.server.schema('api').rpc('finish_portal_photo_analysis',{
   p_request_id:operationId,p_claim_id:null,p_outcome:failedPhotoAssessment(false),
  }).then(()=>undefined,()=>undefined);
 };
 try{
  // Do not create a new reservation when this process cannot prepare a dispatch.
  // Durable receipts remain readable through GET without taking this lease.
  lease=acquireLease('ai');
  if(!lease)return json({requestId:body.requestId,...failedPhotoAssessment(false),error:'too_many_requests'},429);
  const reserved=await caller.rpc('reserve_portal_photo_analysis',{p_object_id:body.objectId,p_document_id:body.documentId,p_request_id:body.requestId});
  if(reserved.error)return failure(reserved.error);
  const envelope=rec(reserved.data),operation=rec(envelope.operation);
  if(envelope.enabled===false)return json({state:'unavailable',assessment:null,publication:'office_review',error:'analysis_disabled'},503);
  if(envelope.state==='quota_reached')return json(envelope,429);
  if(typeof operation.requestId!=='string'||operation.objectId!==body.objectId||operation.documentId!==body.documentId)return json({error:'invalid_receipt'},503);
  operationId=operation.requestId;
  createdReservation=envelope.created===true;
  if(operation.state!=='reserved')return json(operation,operationStatus(operation));
  const context=rec(envelope.context);
  if(context.bucket!==PRIVATE_BUCKET||typeof context.path!=='string'||!/^portal-photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/i.test(context.path)
    ||typeof context.sha256!=='string'||!/^[0-9a-f]{64}$/.test(context.sha256))throw new Error('invalid_source');
  // The existing secret resolver RPC is service-only. Pin this domain to the
  // explicitly selected provider ID; an active menu provider alone cannot enable P.
  const active=await auth.server.schema('api').rpc('get_active_ai_provider_secret');
  const provider=providerSchema.safeParse(Array.isArray(active.data)?active.data[0]:active.data);
  if(active.error||!provider.success||provider.data.id!==context.providerId)throw new Error('provider_unavailable');
  const downloaded=await auth.server.storage.from(PRIVATE_BUCKET).download(context.path);
  if(downloaded.error||!downloaded.data||downloaded.data.size>5*1024*1024)throw new Error('source_unavailable');
  const bytes=Buffer.from(await downloaded.data.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!==context.sha256)throw new Error('source_changed');
  if(req.signal.aborted||deadline-Date.now()<5_000)throw new Error('preparation_timeout');
  claimId=randomUUID();
  startUnconfirmed=true;
  const claim=await caller.rpc('start_portal_photo_analysis',{p_request_id:operationId,p_claim_id:claimId});
  if(claim.error){
   // A connection SQLSTATE can lose the COMMIT acknowledgement too. Keep class
   // 08 uncertain, like fetch/abort failures (whose Supabase code is empty).
   // Other SQLSTATE/PostgREST responses retain the existing refusal handling.
   const code=claim.error.code??'';
   if(!code.startsWith('08')&&/^(?:[A-Z0-9]{5}|PGRST[A-Z0-9]{3})$/.test(code)){
    startUnconfirmed=false;
    await cancelCreatedReservation();
    return failure(claim.error,operationId);
   }
   throw new Error('start_unconfirmed');
  }
  const claimed=rec(claim.data);
  if(typeof claimed.started!=='boolean'||rec(claimed.operation).requestId!==operationId)throw new Error('start_unconfirmed');
  startUnconfirmed=false;
  if(claimed.started!==true){
   const current=rec(claimed.operation);
   return claimed.quotaReached===true?json({...current,quotaReached:true,resetAt:claimed.resetAt},429):json(current,operationStatus(current));
  }
  started=true;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1,deadline-Date.now()));
  let outcome=failedPhotoAssessment(true);
  try{
   const p=provider.data;
   const response=await callVisionExtraction({apiKind:p.api_kind,baseUrl:p.base_url,model:p.model,maxOutputTokens:p.max_output_tokens,extra:p.extra},p.api_key,
    [{mime:'image/jpeg',base64:bytes.toString('base64')}],photoAssessmentPrompt,{signal:controller.signal});
   outcome=parsePhotoAssessment(response.text);
  }catch{/* One dispatch only. Failure/invalid output stays uncertain, without a fake score. */}
  finally{clearTimeout(timer);}
  const finished=await auth.server.schema('api').rpc('finish_portal_photo_analysis',{p_request_id:operationId,p_claim_id:claimId,p_outcome:outcome});
  if(finished.error||rec(finished.data).requestId!==operationId||rec(finished.data).publication!=='office_review')return json({requestId:operationId,state:'uncertain',assessment:null,publication:'office_review'},503);
  return json(finished.data,outcome.state==='uncertain'?202:200);
 }catch{
  // Never cancel another request's reservation or a start whose response is lost.
  await cancelCreatedReservation();
  return json({requestId:operationId??body.requestId,...failedPhotoAssessment(started||startUnconfirmed)},503);
 }finally{lease?.release();}
}

export async function GET(req:NextRequest){
 const auth=await authenticated(req);if(!auth.ok)return auth.response;
 const params=new URL(req.url).searchParams,id=params.get('requestId');
 if([...params.keys()].some(key=>key!=='requestId')||!z.string().uuid().safeParse(id).success)return json({error:'invalid_fields'},400);
 const result=await callerClient(auth.jwt).schema('api').rpc('get_portal_photo_analysis',{p_request_id:id});
 return result.error?failure(result.error):json(result.data);
}
