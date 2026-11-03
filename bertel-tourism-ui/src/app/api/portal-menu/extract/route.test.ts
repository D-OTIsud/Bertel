/** @jest-environment node */
import { POST as extract } from './route';
import { POST as status, GET as list } from './status/route';
import { POST as draft } from './draft/route';
import { authenticated } from '../../_document-auth';
import { resolveActiveAiProvider } from '@/lib/ai-provider.server';
import { acquireLease } from '@/lib/request-body.server';
import { orchestrateExtraction } from '../../menu/extract/orchestrate';
import { CarteRouteError } from '../../restaurant-carte/_shared';
import { extractionRpc, extractionServiceRpc, inspectExtractionSources, reloadExtractionSources, renderExtractionSources } from './_shared';

jest.mock('next/server', () => ({ NextResponse: { json: (v:unknown,i?:ResponseInit)=>new Response(JSON.stringify(v),i) } }));
jest.mock('../../_document-auth', () => ({ authenticated:jest.fn(),callerClient:jest.fn() }));
jest.mock('@/lib/ai-provider.server', () => ({ resolveActiveAiProvider:jest.fn() }));
jest.mock('@/lib/request-body.server', () => ({
 readBoundedJson:jest.fn((r:Request)=>r.json()),acquireLease:jest.fn(),BodyTooLargeError:class extends Error {},
}));
jest.mock('../../menu/extract/orchestrate', () => ({ orchestrateExtraction:jest.fn() }));
jest.mock('./_shared', () => ({ ...jest.requireActual('./_shared'),
 extractionRpc:jest.fn(),extractionServiceRpc:jest.fn(),inspectExtractionSources:jest.fn(),reloadExtractionSources:jest.fn(),renderExtractionSources:jest.fn(),
}));
const ID='00000000-0000-4000-a000-00000000e101',SOURCE='00000000-0000-4000-a000-00000000e102',OBJECT='RESRUN999999E101';
const input=()=>({objectId:OBJECT,requestId:ID,sources:[{kind:'upload',id:SOURCE}],targetMenuId:null,menuTitle:'Carte',lang:'fr'});
const req=(body:unknown=input())=>new Request('https://app.example/api/portal-menu/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}) as never;
const done=()=>({id:ID,objectId:OBJECT,state:'succeeded',result:{menu:{title:'Carte',items:[]}},sourceRefs:input().sources,targetMenuId:null,requestMeta:{menuTitle:'Carte',lang:'fr'}});
const release=jest.fn();
let reads=0;
const normalRpc=async(name:string):Promise<unknown>=>{
 if(name==='get_menu_extraction')return reads++===0?{state:'absent'}:done();
 if(name==='menu_extraction_context')return{context:{sources:[]},allowedSections:[],allowedDietary:[]};
 if(name==='claim_menu_extraction')return{claimed:true,sourceStats:[]};
 if(name==='mark_menu_extraction_started')return{started:true};
 return{};
};
beforeEach(()=>{
 jest.clearAllMocks();reads=0;
 jest.mocked(authenticated).mockResolvedValue({ok:true,jwt:'caller',userId:ID,server:{}} as never);
 jest.mocked(resolveActiveAiProvider).mockResolvedValue({config:{apiKind:'openai_compatible',model:'test'},apiKey:'fake'} as never);
 jest.mocked(acquireLease).mockReturnValue({release} as never);
 jest.mocked(extractionRpc).mockImplementation((_auth,name)=>normalRpc(name));
 jest.mocked(extractionServiceRpc).mockResolvedValue({});
 jest.mocked(inspectExtractionSources).mockResolvedValue([{buffer:Buffer.from('pdf'),stat:{selectedPages:[1]}}] as never);
 jest.mocked(reloadExtractionSources).mockResolvedValue([]);
 jest.mocked(renderExtractionSources).mockResolvedValue([{mime:'image/jpeg',base64:'AAAA'}]);
 jest.mocked(orchestrateExtraction).mockResolvedValue({ok:true,menu:{title:'Carte',items:[]},suggestedDietaryByDish:[]} as never);
});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();});
test('all E endpoints reject anonymous callers before RPC or storage',async()=>{
 jest.mocked(authenticated).mockResolvedValue({ok:false,response:new Response(null,{status:401})} as never);
 for(const handler of [extract,status,draft,list])expect((await handler(req())).status).toBe(401);
 expect(extractionRpc).not.toHaveBeenCalled();expect(inspectExtractionSources).not.toHaveBeenCalled();
});
test('OFF or forbidden gate stops before bytes, provider lookup and quota reservation',async()=>{
 jest.mocked(extractionRpc).mockImplementation(async(_a,name)=>{if(name==='get_menu_extraction')return{state:'absent'};throw new CarteRouteError('extraction_disabled',503);});
 expect((await extract(req())).status).toBe(503);
 expect(resolveActiveAiProvider).not.toHaveBeenCalled();expect(inspectExtractionSources).not.toHaveBeenCalled();expect(extractionServiceRpc).not.toHaveBeenCalled();
});
test('zero active provider returns unavailable without inspecting files or reserving pages',async()=>{
 jest.mocked(resolveActiveAiProvider).mockResolvedValue(null);
 expect((await extract(req())).status).toBe(503);
 expect(jest.mocked(extractionRpc).mock.calls.map(c=>c[1])).toEqual(['get_menu_extraction','menu_extraction_context']);
 expect(inspectExtractionSources).not.toHaveBeenCalled();expect(orchestrateExtraction).not.toHaveBeenCalled();
});
test('unsupported provider is refused before spending or inspecting source bytes',async()=>{
 jest.mocked(resolveActiveAiProvider).mockResolvedValue({config:{apiKind:'anthropic'}} as never);
 expect((await extract(req())).status).toBe(503);expect(inspectExtractionSources).not.toHaveBeenCalled();expect(orchestrateExtraction).not.toHaveBeenCalled();
});
test('one new intention seals server page count, consumes under caller and persists result',async()=>{
 expect((await extract(req())).status).toBe(200);
 expect(extractionServiceRpc).toHaveBeenCalledWith(expect.anything(),'seal_menu_extraction',expect.objectContaining({p_request_id:ID,p_page_count:1,p_request_meta:{menuTitle:'Carte',lang:'fr'}}));
 expect(extractionRpc).toHaveBeenCalledWith(expect.anything(),'mark_menu_extraction_started',expect.objectContaining({p_request_id:ID}));
 expect(jest.mocked(extractionServiceRpc).mock.calls.some(c=>c[1]==='mark_menu_extraction_started')).toBe(false);
 expect(orchestrateExtraction).toHaveBeenCalledTimes(1);
 expect(orchestrateExtraction).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({repairInvalidJson:false}));
 expect(extractionServiceRpc).toHaveBeenLastCalledWith(expect.anything(),'finish_menu_extraction',expect.objectContaining({p_result:expect.objectContaining({menu:expect.anything()})}));
 expect(release).toHaveBeenCalledTimes(1);
});
test('formula warning remains separate in the durable result for the future reviewer',async()=>{
 const warnings=[{code:'formula_price_not_modelled',message:'Review source',offers:[{label:'Entrée + plat',price:'18 €',reason:'formula_price_not_modelled'}]}];
 jest.mocked(orchestrateExtraction).mockResolvedValue({ok:true,menu:{title:'Carte',items:[]},suggestedDietaryByDish:[],warnings} as never);
 expect((await extract(req())).status).toBe(200);
 expect(extractionServiceRpc).toHaveBeenLastCalledWith(expect.anything(),'finish_menu_extraction',expect.objectContaining({p_result:{menu:{title:'Carte',items:[]},suggestedDietaryByDish:[],warnings}}));
});
test.each(['started','uncertain','succeeded','failed','cancelled'])('reload of %s operation never calls provider or reserves again',async state=>{
 jest.mocked(extractionRpc).mockResolvedValue({...done(),state});
 const response=await extract(req());expect(response.status).toBe(['started','uncertain'].includes(state)?202:200);
 expect(resolveActiveAiProvider).not.toHaveBeenCalled();expect(inspectExtractionSources).not.toHaveBeenCalled();expect(orchestrateExtraction).not.toHaveBeenCalled();
});
test('same request ID with different source or title fails before another paid attempt',async()=>{
 jest.mocked(extractionRpc).mockResolvedValue(done());
 expect((await extract(req({...input(),menuTitle:'Changed'}))).status).toBe(409);
 expect(orchestrateExtraction).not.toHaveBeenCalled();
});
test('a concurrent claim does not run or cancel the other worker',async()=>{
 jest.mocked(extractionRpc).mockImplementation((_a,name)=>name==='claim_menu_extraction'?Promise.resolve({claimed:false,operation:{state:'preparing'}}):normalRpc(name));
 expect((await extract(req())).status).toBe(202);expect(orchestrateExtraction).not.toHaveBeenCalled();
 expect(jest.mocked(extractionServiceRpc).mock.calls.some(c=>c[1]==='cancel_menu_extraction_before_dispatch')).toBe(false);
});
test('quota exhausted never rasterizes or calls provider',async()=>{
 jest.mocked(extractionRpc).mockImplementation((_a,name)=>name==='reserve_menu_extraction'?Promise.reject(new CarteRouteError('quota_reached',429)):normalRpc(name));
 expect((await extract(req())).status).toBe(429);expect(renderExtractionSources).not.toHaveBeenCalled();expect(orchestrateExtraction).not.toHaveBeenCalled();
});
test('source conflict immediately before consumption cancels reservation without paid call',async()=>{
 jest.mocked(extractionRpc).mockImplementation((_a,name)=>name==='mark_menu_extraction_started'?Promise.reject(new CarteRouteError('conflict',409)):normalRpc(name));
 expect((await extract(req())).status).toBe(409);expect(orchestrateExtraction).not.toHaveBeenCalled();
 expect(extractionServiceRpc).toHaveBeenCalledWith(expect.anything(),'cancel_menu_extraction_before_dispatch',expect.objectContaining({p_request_id:ID}));
});
test('slow preparation leaves insufficient provider budget and cancels before quota consumption',async()=>{
 let now=1_000;jest.spyOn(Date,'now').mockImplementation(()=>now);
 jest.mocked(renderExtractionSources).mockImplementation(async()=>{now+=30_000;return[{mime:'image/jpeg',base64:'AAAA'}];});
 const response=await extract(req());expect(response.status).toBe(503);expect(await response.json()).toMatchObject({error:'preparation_timeout'});
 expect(jest.mocked(extractionRpc).mock.calls.some(c=>c[1]==='mark_menu_extraction_started')).toBe(false);expect(orchestrateExtraction).not.toHaveBeenCalled();
 expect(extractionServiceRpc).toHaveBeenCalledWith(expect.anything(),'cancel_menu_extraction_before_dispatch',expect.anything());
});
test('rendering has its own deadline without requiring a disconnected browser',async()=>{
 jest.useFakeTimers();
 jest.mocked(renderExtractionSources).mockImplementation(async(_sources,signal)=>new Promise((_resolve,reject)=>signal?.addEventListener('abort',()=>reject(new Error('renderer stopped')),{once:true})));
 const pending=extract(req());await jest.advanceTimersByTimeAsync(25_001);
 const response=await pending;expect(response.status).toBe(503);expect(await response.json()).toMatchObject({error:'preparation_timeout'});
 expect(orchestrateExtraction).not.toHaveBeenCalled();expect(jest.mocked(extractionRpc).mock.calls.some(c=>c[1]==='mark_menu_extraction_started')).toBe(false);
});
test('lost start response closes the same claim as non_dispatch without provider call or automatic refund',async()=>{
 jest.mocked(extractionRpc).mockImplementation((_a,name)=>{
  if(name==='get_menu_extraction')return Promise.resolve(reads++===0?{state:'absent'}:{...done(),state:'failed',error:'non_dispatch'});
  if(name==='mark_menu_extraction_started')return Promise.reject(new CarteRouteError('operation_uncertain',503));
  return normalRpc(name);
 });
 const response=await extract(req());expect(response.status).toBe(200);expect(await response.json()).toMatchObject({state:'failed',error:'non_dispatch'});
 expect(orchestrateExtraction).not.toHaveBeenCalled();expect(extractionServiceRpc).toHaveBeenCalledWith(expect.anything(),'finish_menu_extraction',expect.objectContaining({p_result:null,p_error:'non_dispatch',p_claim_id:expect.any(String)}));
 expect(jest.mocked(extractionServiceRpc).mock.calls.some(c=>c[1]==='cancel_menu_extraction_before_dispatch')).toBe(false);
});
test('uncertain paid response is kept consumed and never cancelled or retried',async()=>{
 jest.mocked(orchestrateExtraction).mockRejectedValue(new Error('response lost'));
 jest.mocked(extractionRpc).mockImplementation((_a,name)=>name==='get_menu_extraction'?Promise.resolve(reads++===0?{state:'absent'}:{state:'started'}):normalRpc(name));
 const response=await extract(req());expect(response.status).toBe(503);expect(await response.json()).toMatchObject({state:'uncertain',requestId:ID});
 expect(orchestrateExtraction).toHaveBeenCalledTimes(1);expect(jest.mocked(extractionServiceRpc).mock.calls.some(c=>c[1]==='cancel_menu_extraction_before_dispatch')).toBe(false);
});
test('lost completion response reads durable result without a second paid attempt',async()=>{
 jest.mocked(extractionServiceRpc).mockImplementation(async(_a,name)=>{if(name==='finish_menu_extraction')throw new Error('lost receipt');return{};});
 expect((await extract(req())).status).toBe(200);expect(orchestrateExtraction).toHaveBeenCalledTimes(1);
});
test('draft saves carry CAS version and status reload never invokes AI',async()=>{
 jest.mocked(extractionRpc).mockResolvedValue({draft:{menu:{title:'Correction'}},draftVersion:2});
 expect((await draft(req({requestId:ID,expectedVersion:1,draft:{menu:{title:'Correction'}}}))).status).toBe(200);
 expect(extractionRpc).toHaveBeenCalledWith(expect.anything(),'save_menu_extraction_draft',{p_request_id:ID,p_expected_version:1,p_draft:{menu:{title:'Correction'}}});
 expect((await status(req({requestId:ID}))).status).toBe(200);expect(orchestrateExtraction).not.toHaveBeenCalled();
});
test('draft version conflict retains the operation ID and rejects replacement',async()=>{
 jest.mocked(extractionRpc).mockRejectedValue(new CarteRouteError('conflict',409));
 const response=await draft(req({requestId:ID,expectedVersion:1,draft:{menu:{title:'Stale'}}}));
 expect(response.status).toBe(409);expect(await response.json()).toMatchObject({requestId:ID});
});
test('saving a published draft reports HTTP409',async()=>{
 jest.mocked(extractionRpc).mockRejectedValue(new CarteRouteError('conflict',409));
 expect((await draft(req({requestId:ID,expectedVersion:2,draft:{menu:{title:'Already published'}}}))).status).toBe(409);
});
test('server recovery lists the caller operations without relying on local browser metadata',async()=>{
 jest.mocked(extractionRpc).mockResolvedValue([{id:ID,state:'succeeded'}]);
 const response=await list(new Request('https://app.example/api/portal-menu/extract/status?object_id='+OBJECT) as never);
 expect(response.status).toBe(200);expect(await response.json()).toEqual({operations:[{id:ID,state:'succeeded'}]});
 expect(extractionRpc).toHaveBeenCalledWith(expect.anything(),'list_menu_extractions',{p_object_id:OBJECT});
 expect(orchestrateExtraction).not.toHaveBeenCalled();
});
