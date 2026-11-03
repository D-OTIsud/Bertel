import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticated } from '../../_document-auth';
import { record, json, failure, CarteRouteError } from '../../restaurant-carte/_shared';
import { readBoundedJson, BodyTooLargeError, acquireLease } from '@/lib/request-body.server';
import { resolveActiveAiProvider } from '@/lib/ai-provider.server';
import { MenuDocumentError } from '@/lib/menu-document-pages.server';
import { orchestrateExtraction } from '../../menu/extract/orchestrate';
import { canonical, extractionRpc, extractionServiceRpc, inspectExtractionSources, renderExtractionSources, reloadExtractionSources, type SourceStat, type InspectedSource } from './_shared';

export const runtime='nodejs';
export const maxDuration=60;
const request=z.object({
 objectId:z.string().regex(/^[A-Z]{3}[A-Z0-9]{13}$/),requestId:z.string().uuid(),
 sources:z.array(z.object({kind:z.enum(['upload','carte']),id:z.string().uuid(),
  pages:z.array(z.number().int().min(1).max(200)).min(1).max(8).optional(),expected:z.record(z.unknown()).nullable().optional()}).strict()).min(1).max(8),
 targetMenuId:z.string().uuid().nullable().default(null),menuTitle:z.string().max(180).default(''),lang:z.string().regex(/^[a-zA-Z-]{2,10}$/).default('fr'),
}).strict();
const terminal=['started','uncertain','succeeded','failed','cancelled'];
const MIN_PROVIDER_BUDGET_MS=30_000;
export async function POST(req:NextRequest){
 const deadline=Date.now()+55_000;
 const auth=await authenticated(req);if(!auth.ok)return auth.response;
 let body:z.infer<typeof request>;
 try{body=request.parse(await readBoundedJson(req,128*1024));}
 catch(error){return json({error:error instanceof BodyTooLargeError?'request_body_too_large':'invalid_fields'},error instanceof BodyTooLargeError?413:400);}
 let claimId:string|null=null,paid=false,startAttempted=false;
 const meta={menuTitle:body.menuTitle,lang:body.lang};
 let lease:ReturnType<typeof acquireLease>|null=null;
 try{
  const existing=record(await extractionRpc(auth,'get_menu_extraction',{p_request_id:body.requestId}));
  if(existing&&existing.state!=='absent'){
   if(existing.objectId!==body.objectId||canonical(existing.sourceRefs)!==canonical(body.sources)
    ||existing.targetMenuId!==body.targetMenuId||canonical(existing.requestMeta)!==canonical(meta))throw new CarteRouteError('conflict',409);
   if(terminal.includes(String(existing.state)))return json(existing,['started','uncertain'].includes(String(existing.state))?202:200);
  }
  // This authoritative gate also requires a configured quota. No bytes or provider call while OFF.
  const envelope=record(await extractionRpc(auth,'menu_extraction_context',{p_object_id:body.objectId,p_sources:body.sources,p_target_menu_id:body.targetMenuId}));
  const context=record(envelope?.context);
  if(!context||!Array.isArray(envelope?.allowedSections)||!Array.isArray(envelope?.allowedDietary))throw new CarteRouteError('invalid_context',503);
  let provider=await resolveActiveAiProvider(auth.server);
  if(!provider||provider.config.apiKind!=='openai_compatible')return json({error:'provider_unavailable',requestId:body.requestId},503);
  lease=acquireLease('ai');if(!lease)return json({error:'too_many_requests',requestId:body.requestId},429);
  let sources:InspectedSource[]|undefined;
  if(!existing||existing.state==='absent'){
   sources=await inspectExtractionSources(auth,context,body.sources);
   const stats=sources.map(s=>s.stat),pages=stats.reduce((sum,s)=>sum+s.selectedPages.length,0);
   await extractionServiceRpc(auth,'seal_menu_extraction',{p_request_id:body.requestId,p_user_id:auth.userId,p_object_id:body.objectId,
    p_sources:body.sources,p_target_menu_id:body.targetMenuId,p_context:context,p_source_stats:stats,p_page_count:pages,p_request_meta:meta});
  }
  await extractionRpc(auth,'reserve_menu_extraction',{p_request_id:body.requestId});
  claimId=randomUUID();
  const claim=record(await extractionRpc(auth,'claim_menu_extraction',{p_request_id:body.requestId,p_claim_id:claimId}));
  if(claim?.claimed!==true)return json(claim?.operation??{state:'preparing',requestId:body.requestId},202);
  if(!sources)sources=await reloadExtractionSources(auth,claim.sourceStats as SourceStat[]);
  const renderBudget=deadline-Date.now()-MIN_PROVIDER_BUDGET_MS;
  if(req.signal.aborted||renderBudget<=0)throw new CarteRouteError('preparation_timeout',503);
  const renderController=new AbortController(),cancelRender=()=>renderController.abort();
  req.signal.addEventListener('abort',cancelRender,{once:true});
  const renderTimer=setTimeout(cancelRender,renderBudget);
  let images:Awaited<ReturnType<typeof renderExtractionSources>>;
  try{images=await renderExtractionSources(sources,renderController.signal);}
  catch(error){if(renderController.signal.aborted)throw new CarteRouteError('preparation_timeout',503);throw error;}
  finally{clearTimeout(renderTimer);req.signal.removeEventListener('abort',cancelRender);}
  // Recheck current provider, ownership, M activation and source immediately before dispatch.
  provider=await resolveActiveAiProvider(auth.server);
  if(!provider||provider.config.apiKind!=='openai_compatible')throw new CarteRouteError('provider_unavailable',503);
  if(req.signal.aborted||deadline-Date.now()<MIN_PROVIDER_BUDGET_MS)throw new CarteRouteError('preparation_timeout',503);
  await extractionRpc(auth,'assert_menu_extraction_dispatch',{p_request_id:body.requestId,p_claim_id:claimId});
  if(req.signal.aborted||deadline-Date.now()<MIN_PROVIDER_BUDGET_MS)throw new CarteRouteError('preparation_timeout',503);
  startAttempted=true;
  const started=record(await extractionRpc(auth,'mark_menu_extraction_started',{p_request_id:body.requestId,p_claim_id:claimId}));
  if(started?.started!==true)throw new CarteRouteError(String(started?.error||'extraction_disabled'),409);
  paid=true;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),Math.max(1,deadline-Date.now()));
  try{
   const result=await orchestrateExtraction({
    menuTitle:body.menuTitle,lang:body.lang,images,reportUnsupportedOffers:true,
    allowedSections:envelope.allowedSections as never,allowedDietary:envelope.allowedDietary as never,
   },{getActiveProvider:async()=>provider,signal:controller.signal,repairInvalidJson:false});
   await extractionServiceRpc(auth,'finish_menu_extraction',{p_request_id:body.requestId,p_claim_id:claimId,
    p_result:result.ok?{menu:result.menu,suggestedDietaryByDish:result.suggestedDietaryByDish,warnings:result.warnings??[]}:null,
    p_error:result.ok?null:result.code});
  }finally{clearTimeout(timeout);}
  return json(await extractionRpc(auth,'get_menu_extraction',{p_request_id:body.requestId}));
 }catch(error){
  if(claimId&&!paid&&startAttempted){
   // This process has not invoked the provider. If the start receipt committed,
   // close that exact claim definitively, retaining its conservative quota debit.
   await extractionServiceRpc(auth,'finish_menu_extraction',{p_request_id:body.requestId,p_claim_id:claimId,
    p_result:null,p_error:'non_dispatch'}).catch(()=>undefined);
   const confirmed=record(await extractionRpc(auth,'get_menu_extraction',{p_request_id:body.requestId}).catch(()=>null));
   if(confirmed?.state==='failed'&&confirmed.error==='non_dispatch')return json(confirmed);
  }
  if(claimId&&!paid){
   await extractionServiceRpc(auth,'cancel_menu_extraction_before_dispatch',{p_request_id:body.requestId,p_claim_id:claimId,
    p_error:error instanceof Error?error.message.slice(0,80):'preparation_failed'}).catch(()=>undefined);
  }
  if(paid){
   const status=record(await extractionRpc(auth,'get_menu_extraction',{p_request_id:body.requestId}).catch(()=>null));
   if(status?.state==='succeeded'||status?.state==='failed')return json(status);
   return json({error:'operation_uncertain',requestId:body.requestId,state:'uncertain'},503);
  }
  if(error instanceof MenuDocumentError)return json({error:error.code,requestId:body.requestId,...(error.pageCount?{pageCount:error.pageCount}:{})},error.code==='size'?413:400);
  return failure(error,{requestId:body.requestId});
 }finally{lease?.release();}
}
