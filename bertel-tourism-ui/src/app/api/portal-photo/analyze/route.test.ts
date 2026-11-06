/** @jest-environment node */
import {createHash} from 'node:crypto';
import {POST,GET} from './route';
import {POST as appeal} from './appeal/route';
import {authenticated,callerClient} from '../../_document-auth';
import {callVisionExtraction} from '../../menu/extract/provider';
import {acquireLease} from '@/lib/request-body.server';
jest.mock('../../_document-auth',()=>({authenticated:jest.fn(),callerClient:jest.fn(),PRIVATE_BUCKET:'actor-documents'}));
jest.mock('../../menu/extract/provider',()=>({callVisionExtraction:jest.fn()}));
jest.mock('@/lib/request-body.server',()=>({...jest.requireActual('@/lib/request-body.server'),readBoundedJson:jest.fn(req=>req.json()),acquireLease:jest.fn()}));
const DOC='00000000-0000-4000-af00-000000000001',REQ='00000000-0000-4000-af00-000000000011',PROVIDER='00000000-0000-4000-af00-000000000021';
const input={objectId:'HOTRUN999999C502',documentId:DOC,requestId:REQ};
const data={score:10,summary:'Le lieu est net.',strengths:['Le sujet est lisible.'],issues:[]};
const operation={requestId:REQ,objectId:input.objectId,documentId:DOC,state:'reserved',assessment:null,publication:'office_review'};
const rpc=jest.fn(),service=jest.fn(),download=jest.fn();
const request=(body:unknown=input,signal?:AbortSignal)=>new Request('http://localhost/api/portal-photo/analyze',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'},signal}) as never;
const deferred=<T,>()=>{
 let resolve!:(value:T)=>void;
 const promise=new Promise<T>(done=>{resolve=done;});
 return {promise,resolve};
};
beforeEach(()=>{
 jest.clearAllMocks();
 jest.mocked(acquireLease).mockImplementation(jest.requireActual('@/lib/request-body.server').acquireLease);
 rpc.mockImplementation(async(name)=>name==='reserve_portal_photo_analysis'?{data:{created:true,operation,context:{bucket:'actor-documents',path:`portal-photos/00000000-0000-4000-a000-00000000c521/${DOC}.jpg`,sha256:createHash('sha256').update('JPEG').digest('hex'),providerId:PROVIDER}},error:null}
  :name==='start_portal_photo_analysis'?{data:{started:true,operation:{...operation,state:'started'}},error:null}
  :name==='get_portal_photo_analysis'?{data:{...operation,state:'assessed',assessment:data},error:null}
  :{data:'00000000-0000-4000-af00-000000000031',error:null});
 service.mockImplementation(async(name,args)=>name==='get_active_ai_provider_secret'?{data:[{id:PROVIDER,api_kind:'openai_compatible',base_url:'https://provider.invalid/v1',model:'fixture-vision',max_output_tokens:1024,extra:{},api_key:null}],error:null}
  :{data:{...operation,state:args.p_outcome.state,assessment:args.p_outcome.assessment},error:null});
 download.mockResolvedValue({data:new Blob(['JPEG']),error:null});
 jest.mocked(callVisionExtraction).mockResolvedValue({text:JSON.stringify(data)});
 jest.mocked(authenticated).mockResolvedValue({ok:true,userId:'partner',jwt:'actor-token',server:{schema:()=>({rpc:service}),storage:{from:()=>({download})}}} as never);
 jest.mocked(callerClient).mockReturnValue({schema:()=>({rpc})} as never);
});
test('sans authentification, aucune lecture privée ni opération payante',async()=>{
 jest.mocked(authenticated).mockResolvedValue({ok:false,response:new Response(null,{status:401})} as never);
 expect((await POST(request())).status).toBe(401);expect((await appeal(request())).status).toBe(401);expect(rpc).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();
});
test('OFF par défaut : aucune lecture Storage, résolution fournisseur ou réservation payante cachée',async()=>{
 rpc.mockResolvedValue({data:{enabled:false,state:'unavailable',assessment:null,publication:'office_review'},error:null});
 const result=await POST(request());expect(result.status).toBe(503);expect(await result.json()).toMatchObject({state:'unavailable',assessment:null,publication:'office_review'});
 expect(service).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();expect(callVisionExtraction).not.toHaveBeenCalled();
});
test('quota propre atteint : retour de la reprise calculée au serveur sans appel fournisseur',async()=>{
 rpc.mockResolvedValue({data:{enabled:true,state:'quota_reached',resetAt:'2026-11-03T20:00:00Z'},error:null});
 expect((await POST(request())).status).toBe(429);expect(service).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();
});
test('les champs arbitraires et une photo étrangère sont refusés avant ses octets',async()=>{
 expect((await POST(request({...input,publish:true}))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
 rpc.mockResolvedValue({data:null,error:{code:'42501'}});expect((await POST(request())).status).toBe(403);expect(download).not.toHaveBeenCalled();
});
test.each([['assessed',200],['started',202],['uncertain',202],['unavailable',503]])('une opération %s se relit avec le même statut sans nouvelle analyse',async(state,status)=>{
 rpc.mockResolvedValue({data:{created:false,operation:{...operation,state}},error:null});
 expect((await POST(request())).status).toBe(status);expect(service).not.toHaveBeenCalled();expect(callVisionExtraction).not.toHaveBeenCalled();
});

test('le lease est pris avant réserve : B occupé ne peut annuler la préparation de A',async()=>{
 const ready=deferred<void>(),source=deferred<{data:Blob;error:null}>();
 download.mockImplementationOnce(()=>{ready.resolve();return source.promise;});
 const first=POST(request());
 await ready.promise;
 try{
  const second=await POST(request({...input,requestId:'00000000-0000-4000-af00-000000000012'}));
  expect(second.status).toBe(429);
  expect(rpc.mock.calls.filter(([name])=>name==='reserve_portal_photo_analysis')).toHaveLength(1);
  expect(service.mock.calls.filter(([name])=>name==='finish_portal_photo_analysis')).toHaveLength(0);
 }finally{
  source.resolve({data:new Blob(['JPEG']),error:null});
 }
 expect((await first).status).toBe(200);
 expect(callVisionExtraction).toHaveBeenCalledTimes(1);
});

test.each(['download','abort'])('B reprend la réservation de A puis échoue (%s) : aucune compensation, A dispatch une fois',async(reason)=>{
 // Independent leases simulate two Node instances sharing the same durable receipt.
 jest.mocked(acquireLease).mockImplementation(()=>({release:jest.fn()}));
 const base=rpc.getMockImplementation()!;
 let reservations=0;
 rpc.mockImplementation(async(name,args)=>{
  const result=await base(name,args);
  return name==='reserve_portal_photo_analysis'?{...result,data:{...result.data,created:++reservations===1}}:result;
 });
 const ready=deferred<void>(),source=deferred<{data:Blob;error:null}>();
 download.mockImplementationOnce(()=>{ready.resolve();return source.promise;});
 if(reason==='download')download.mockResolvedValueOnce({data:null,error:{message:'unavailable'}});
 const first=POST(request());
 await ready.promise;
 try{
  const controller=new AbortController();
  if(reason==='abort')controller.abort();
  const second=await POST(request({...input,requestId:'00000000-0000-4000-af00-000000000012'},controller.signal));
  expect(second.status).toBe(503);
  expect(await second.json()).toMatchObject({requestId:REQ,state:'unavailable',assessment:null});
  expect(service.mock.calls.filter(([name])=>name==='finish_portal_photo_analysis')).toHaveLength(0);
  expect(rpc.mock.calls.filter(([name])=>name==='start_portal_photo_analysis')).toHaveLength(0);
 }finally{
  source.resolve({data:new Blob(['JPEG']),error:null});
 }
 expect((await first).status).toBe(200);
 expect(callVisionExtraction).toHaveBeenCalledTimes(1);
 expect(service.mock.calls.filter(([name])=>name==='finish_portal_photo_analysis')).toHaveLength(1);
});
test('fournisseur absent avant dispatch : indisponible, sans mauvaise note, réservation libérée',async()=>{
 service.mockResolvedValue({data:null,error:null});
 const result=await POST(request());expect(result.status).toBe(503);expect(await result.json()).toMatchObject({state:'unavailable',assessment:null});
 expect(service).toHaveBeenLastCalledWith('finish_portal_photo_analysis',{p_request_id:REQ,p_claim_id:null,p_outcome:{state:'unavailable',assessment:null,publication:'office_review'}});
 expect(callVisionExtraction).not.toHaveBeenCalled();
});
test('les octets privés doivent correspondre au hash enregistré avant la réservation',async()=>{
 download.mockResolvedValue({data:new Blob(['changed']),error:null});
 expect((await POST(request())).status).toBe(503);expect(rpc).not.toHaveBeenCalledWith('start_portal_photo_analysis',expect.anything());expect(callVisionExtraction).not.toHaveBeenCalled();
});
test('un autre demandeur détient déjà le dispatch : aucun second appel payant',async()=>{
 const base=rpc.getMockImplementation()!;rpc.mockImplementation((name,args)=>name==='start_portal_photo_analysis'?Promise.resolve({data:{started:false,operation:{...operation,state:'started'}},error:null}):base(name,args));
 expect((await POST(request())).status).toBe(202);expect(callVisionExtraction).not.toHaveBeenCalled();
});
test('réponse de démarrage perdue : pas de nouvel appel et état incertain conservateur',async()=>{
 const base=rpc.getMockImplementation()!;rpc.mockImplementation((name,args)=>name==='start_portal_photo_analysis'?Promise.resolve({data:null,error:{code:'',message:'lost'}}):base(name,args));
 const result=await POST(request());expect(result.status).toBe(503);expect(await result.json()).toMatchObject({state:'uncertain',assessment:null});expect(callVisionExtraction).not.toHaveBeenCalled();
 expect(service.mock.calls.filter(([name])=>name==='finish_portal_photo_analysis')).toHaveLength(0);
});

test('SQLSTATE 08006 au démarrage peut perdre le COMMIT : incertain sans compensation ni dispatch',async()=>{
 const base=rpc.getMockImplementation()!;
 rpc.mockImplementation((name,args)=>name==='start_portal_photo_analysis'?Promise.resolve({data:null,error:{code:'08006',message:'connection lost during COMMIT'}}):base(name,args));
 const result=await POST(request());
 expect(result.status).toBe(503);
 expect(await result.json()).toMatchObject({requestId:REQ,state:'uncertain',assessment:null,publication:'office_review'});
 expect(service.mock.calls.filter(([name])=>name==='finish_portal_photo_analysis')).toHaveLength(0);
 expect(callVisionExtraction).not.toHaveBeenCalled();
});

test('PGRST001 au démarrage suit la politique menus/galerie : incertain sans compensation ni dispatch',async()=>{
 const base=rpc.getMockImplementation()!;
 rpc.mockImplementation((name,args)=>name==='start_portal_photo_analysis'?Promise.resolve({data:null,error:{code:'PGRST001',message:'database connection response unavailable'}}):base(name,args));
 const result=await POST(request());
 expect(result.status).toBe(503);
 expect(await result.json()).toMatchObject({requestId:REQ,state:'uncertain',assessment:null,publication:'office_review'});
 expect(service.mock.calls.filter(([name])=>name==='finish_portal_photo_analysis')).toHaveLength(0);
 expect(callVisionExtraction).not.toHaveBeenCalled();
});

test('une exception réseau au démarrage garde aussi la réservation incertaine',async()=>{
 const base=rpc.getMockImplementation()!;
 rpc.mockImplementation((name,args)=>name==='start_portal_photo_analysis'?Promise.reject(new TypeError('fetch failed')):base(name,args));
 const result=await POST(request());
 expect(result.status).toBe(503);
 expect(await result.json()).toMatchObject({state:'uncertain',assessment:null});
 expect(service.mock.calls.filter(([name])=>name==='finish_portal_photo_analysis')).toHaveLength(0);
 expect(callVisionExtraction).not.toHaveBeenCalled();
});

test.each([['42501',403,'forbidden'],['PT409',409,'conflict'],['55P03',503,'unavailable'],['22023',400,'invalid_fields']])('un refus confirmé de start %s répond %s sans annoncer une incertitude',async(code,status,error)=>{
 const base=rpc.getMockImplementation()!;
 rpc.mockImplementation((name,args)=>name==='start_portal_photo_analysis'?Promise.resolve({data:null,error:{code,message:'refus confirmé'}}):base(name,args));
 const result=await POST(request());
 expect(result.status).toBe(status);
 expect(await result.json()).toMatchObject({requestId:REQ,state:'unavailable',assessment:null,publication:'office_review',error});
 expect(service).toHaveBeenLastCalledWith('finish_portal_photo_analysis',{p_request_id:REQ,p_claim_id:null,p_outcome:{state:'unavailable',assessment:null,publication:'office_review'}});
 expect(callVisionExtraction).not.toHaveBeenCalled();
});

test('un refus confirmé sur une réservation reprise ne compense pas la réservation d’autrui',async()=>{
 const base=rpc.getMockImplementation()!;
 rpc.mockImplementation(async(name,args)=>{
  if(name==='start_portal_photo_analysis')return {data:null,error:{code:'42501'}};
  const result=await base(name,args);
  return name==='reserve_portal_photo_analysis'?{...result,data:{...result.data,created:false}}:result;
 });
 expect((await POST(request())).status).toBe(403);
 expect(service.mock.calls.filter(([name])=>name==='finish_portal_photo_analysis')).toHaveLength(0);
 expect(callVisionExtraction).not.toHaveBeenCalled();
});

test('un start terminé unavailable répond 503 et conserve le reçu',async()=>{
 const base=rpc.getMockImplementation()!;
 rpc.mockImplementation((name,args)=>name==='start_portal_photo_analysis'?Promise.resolve({data:{started:false,operation:{...operation,state:'unavailable'}},error:null}):base(name,args));
 const result=await POST(request());
 expect(result.status).toBe(503);
 expect(await result.json()).toMatchObject({requestId:REQ,state:'unavailable',assessment:null});
 expect(service.mock.calls.filter(([name])=>name==='finish_portal_photo_analysis')).toHaveLength(0);
 expect(callVisionExtraction).not.toHaveBeenCalled();
});

test('le quota atteint au changement de jour reste une réponse 429 sans dispatch',async()=>{
 const base=rpc.getMockImplementation()!;
 rpc.mockImplementation((name,args)=>name==='start_portal_photo_analysis'?Promise.resolve({data:{started:false,operation:{...operation,state:'unavailable'},quotaReached:true,resetAt:'2026-11-04T20:00:00Z'},error:null}):base(name,args));
 const result=await POST(request());
 expect(result.status).toBe(429);
 expect(await result.json()).toMatchObject({state:'unavailable',quotaReached:true,resetAt:'2026-11-04T20:00:00Z'});
 expect(callVisionExtraction).not.toHaveBeenCalled();
});
test('même une note de dix ne publie rien : un appel, un reçu, office_review',async()=>{
 const result=await POST(request());expect(result.status).toBe(200);expect(await result.json()).toMatchObject({state:'assessed',assessment:{score:10},publication:'office_review'});
 expect(callVisionExtraction).toHaveBeenCalledTimes(1);expect(service).toHaveBeenLastCalledWith('finish_portal_photo_analysis',expect.objectContaining({p_request_id:REQ,p_claim_id:expect.stringMatching(/^[0-9a-f-]{36}$/),p_outcome:{state:'assessed',assessment:data,publication:'office_review'}}));
 expect(rpc.mock.calls.map(call=>call[0])).toEqual(['reserve_portal_photo_analysis','start_portal_photo_analysis']);
});
test('un résultat non conforme devient incertain sans réparation payante ni note inventée',async()=>{
 jest.mocked(callVisionExtraction).mockResolvedValue({text:'{"score":99,"publish":true}'});
 const result=await POST(request());expect(result.status).toBe(202);expect(await result.json()).toMatchObject({state:'uncertain',assessment:null,publication:'office_review'});expect(callVisionExtraction).toHaveBeenCalledTimes(1);
});
test('une réponse de finalisation perdue ne relance pas le fournisseur',async()=>{
 const base=service.getMockImplementation()!;service.mockImplementation((name,args)=>name==='finish_portal_photo_analysis'?Promise.resolve({data:null,error:{message:'lost'}}):base(name,args));
 expect((await POST(request())).status).toBe(503);expect(callVisionExtraction).toHaveBeenCalledTimes(1);
});
test('GET protégé et recours réutilisent les RPC du vrai appelant sans IA ni attachment détourné',async()=>{
 expect((await GET(new Request(`http://localhost/api/portal-photo/analyze?requestId=${REQ}`) as never)).status).toBe(200);
 const result=await appeal(request({requestId:REQ,clientId:'00000000-0000-4000-af00-000000000031',body:'Je souhaite une relecture.'}));
 expect(result.status).toBe(200);expect(rpc).toHaveBeenLastCalledWith('appeal_portal_photo_analysis',{p_request_id:REQ,p_client_id:'00000000-0000-4000-af00-000000000031',p_body:'Je souhaite une relecture.'});
 expect(service).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();expect(callVisionExtraction).not.toHaveBeenCalled();
});

test.each([
 ['22023','Recours invalide',400,'invalid_fields'],
 ['42501','Fiche inaccessible',403,'forbidden'],
 ['PT409','Un recours existe déjà',409,'conflict'],
 ['23505','duplicate key value violates unique constraint',409,'conflict'],
 ['P0001','Limite quotidienne atteinte. Réessayez demain.',429,'quota_reached'],
 ['P0001','Une autre erreur métier',503,'unavailable'],
])('le recours mappe %s/%s vers %s sans exposer le message SQL',async(code,message,status,error)=>{
 rpc.mockResolvedValue({data:null,error:{code,message}});
 const result=await appeal(request({requestId:REQ,clientId:'00000000-0000-4000-af00-000000000031',body:'Je souhaite une relecture.'}));
 expect(result.status).toBe(status);
 expect(await result.json()).toEqual({error});
 expect(result.headers.get('cache-control')).toBe('private, no-store');
 expect(service).not.toHaveBeenCalled();
 expect(download).not.toHaveBeenCalled();
 expect(callVisionExtraction).not.toHaveBeenCalled();
});
