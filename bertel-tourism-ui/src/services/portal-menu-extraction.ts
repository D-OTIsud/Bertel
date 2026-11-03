/** E backend contract only. No new screen calls it before design/rollout approval. */
import { getApiClient } from '../lib/supabase';
export interface MenuExtractionSource {
 kind:'upload'|'carte';id:string;pages?:number[];expected?:Record<string,unknown>|null;
}
export interface MenuExtractionRequest {
 objectId:string;requestId:string;sources:MenuExtractionSource[];targetMenuId?:string|null;menuTitle?:string;lang?:string;
}
export type MenuExtractionState='absent'|'inspected'|'reserved'|'preparing'|'started'|'uncertain'|'succeeded'|'failed'|'cancelled';
export interface MenuExtractionOperation {
 id?:string;objectId?:string;state:MenuExtractionState;result?:Record<string,unknown>|null;draft?:Record<string,unknown>|null;draftVersion?:number;
 quota?:{limit:number|null;reserved:number;consumed:number;remaining:number;resetAt:string};
 publishedResult?:Record<string,unknown>|null;error?:string|null;
}
export class MenuExtractionError extends Error {
 constructor(readonly code:string,readonly requestId:string|null,readonly status:number){
  super(code==='quota_reached'?'Le quota de pages est atteint. Votre carte reste disponible pour une saisie manuelle.':
   code==='conflict'?'La source ou le menu a changé. Votre brouillon est conservé.':
   code==='extraction_disabled'||code==='provider_unavailable'?'L’extraction est indisponible. Vous pouvez saisir le menu manuellement.':
   'Le résultat doit être vérifié avant de recommencer. Retrouvez l’opération pour conserver votre travail.');
 }
}
async function request(path:string,body?:Record<string,unknown>,id:string|null=null){
 const client=getApiClient();if(!client)throw new MenuExtractionError('unavailable',id,503);
 const session=await client.auth.getSession();
 if(session.error||!session.data.session?.access_token)throw new MenuExtractionError('unauthenticated',id,401);
 let response:Response,data:Record<string,unknown>;
 try{
  response=await fetch(path,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+session.data.session.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  data=await response.json() as Record<string,unknown>;
 }catch{throw new MenuExtractionError('operation_uncertain',id,503);}
 if(!response.ok)throw new MenuExtractionError(typeof data.error==='string'?data.error:'operation_uncertain',id,response.status);
 return data;
}
/** Keep this intent ID until status confirms the result; retrying never creates another paid job. */
export async function startPortalMenuExtraction(input:MenuExtractionRequest):Promise<MenuExtractionOperation>{
 return await request('/api/portal-menu/extract',{...input},input.requestId) as unknown as MenuExtractionOperation;
}
export async function getPortalMenuExtraction(requestId:string):Promise<MenuExtractionOperation>{
 return await request('/api/portal-menu/extract/status',{requestId},requestId) as unknown as MenuExtractionOperation;
}
export async function listPortalMenuExtractions(objectId:string){
 const data=await request('/api/portal-menu/extract/status?object_id='+encodeURIComponent(objectId));
 return Array.isArray(data.operations)?data.operations as {id:string;state:MenuExtractionState;pages:number;createdAt:string;draftVersion:number;published:boolean}[]:[];
}
export async function savePortalMenuExtractionDraft(requestId:string,expectedVersion:number,draft:Record<string,unknown>){
 return request('/api/portal-menu/extract/draft',{requestId,expectedVersion,draft},requestId);
}
