import { createHash } from 'node:crypto';
import type { AuthenticatedRequest } from '../../_document-auth';
import { callerClient } from '../../_document-auth';
import { record, parseReceipt, CarteRouteError, digest, MAX_CARTE_BYTES } from '../../restaurant-carte/_shared';
import { inspectMenuDocument, renderMenuDocument, type MenuDocumentInspection } from '@/lib/menu-document-pages.server';
import type { VisionImage } from '../../menu/extract/provider';

export type ExtractionAuth = Extract<AuthenticatedRequest,{ok:true}>;
export interface ExtractionSource { kind:'upload'|'carte'; id:string; pages?:number[]; expected?:Record<string,unknown>|null }
export interface SourceStat extends MenuDocumentInspection {
 id:string; bucket:string; path:string; sha256:string; storageExpected:Record<string,unknown>;
}
export interface InspectedSource { buffer:Buffer; stat:SourceStat }
export function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 const row=record(value);
 if(row)return '{'+Object.keys(row).sort().map(k=>JSON.stringify(k)+':'+canonical(row[k])).join(',')+'}';
 return JSON.stringify(value)??'null';
}
export function extractionRpcError(error:unknown) {
 const code=record(error)?.code;
 if(code==='PT429')return new CarteRouteError('quota_reached',429);
 if(code==='PT503')return new CarteRouteError('extraction_disabled',503);
 if(code==='42501')return new CarteRouteError('forbidden',403);
 if(code==='PT409'||code==='23505')return new CarteRouteError('conflict',409);
 if(typeof code==='string'&&code.startsWith('22'))return new CarteRouteError('invalid_fields',400);
 return new CarteRouteError('operation_uncertain',503);
}
export async function extractionRpc(auth:ExtractionAuth,name:string,args:Record<string,unknown>){
 const result=await callerClient(auth.jwt).schema('api').rpc(name,args);
 if(result.error)throw extractionRpcError(result.error);
 return result.data as unknown;
}
export async function extractionServiceRpc(auth:ExtractionAuth,name:string,args:Record<string,unknown>){
 const result=await auth.server.schema('api').rpc(name,args);
 if(result.error)throw extractionRpcError(result.error);
 return result.data as unknown;
}
function publicPointer(row:Record<string,unknown>):{bucket:string;path:string}{
 if(row.storageBucket==='documents'&&typeof row.storagePath==='string'&&safePath(row.storagePath)){
  return{bucket:'documents',path:row.storagePath};
 }
 try{
  const url=new URL(String(row.url)),configured=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL||'');
  const prefix='/storage/v1/object/public/documents/';
  if(url.origin!==configured.origin||!url.pathname.startsWith(prefix)||url.search||url.hash||url.username||url.password)throw Error();
  const path=decodeURIComponent(url.pathname.slice(prefix.length));
  if(!safePath(path))throw Error();
  return{bucket:'documents',path};
 }catch{throw new CarteRouteError('upload_source_required',400);}
}
function safePath(path:string){return path.length>0&&path.length<1024&&!/[\\\u0000-\u001f]/.test(path)&&path.split('/').every(p=>p!==''&&p!=='.'&&p!=='..');}
export async function inspectExtractionSources(auth:ExtractionAuth,context:Record<string,unknown>,refs:ExtractionSource[]):Promise<InspectedSource[]> {
 if(!Array.isArray(context.sources)||context.sources.length!==refs.length)throw new CarteRouteError('invalid_context',503);
 const out:InspectedSource[]=[];
 let selected=0;
 for(let i=0;i<refs.length;i++){
  const row=record(context.sources[i]);
  if(!row||row.id!==refs[i].id||row.kind!==refs[i].kind)throw new CarteRouteError('invalid_context',503);
  let pointer:{bucket:string;path:string},expectedHash:string|null=null;
  if(row.kind==='upload'){
   const upload=parseReceipt(row.upload);pointer={bucket:upload.stagingBucket,path:upload.stagingPath};expectedHash=upload.sha256;
  }else pointer=publicPointer(row);
  const before=record(await extractionServiceRpc(auth,'menu_extraction_storage_receipt',{p_bucket:pointer.bucket,p_path:pointer.path}));
  if(!before)throw new CarteRouteError('source_unavailable',503);
  const declared=Number(record(before.metadata)?.size);
  if(Number.isFinite(declared)&&declared>MAX_CARTE_BYTES)throw new CarteRouteError('size',413);
  const downloaded=await auth.server.storage.from(pointer.bucket).download(pointer.path);
  if(downloaded.error||!downloaded.data)throw new CarteRouteError('source_unavailable',503);
  if(downloaded.data.size<1||downloaded.data.size>MAX_CARTE_BYTES)throw new CarteRouteError('size',413);
  const buffer=Buffer.from(await downloaded.data.arrayBuffer()),sha256=digest(buffer);
  if(expectedHash&&expectedHash!==sha256)throw new CarteRouteError('source_changed',409);
  const after=record(await extractionServiceRpc(auth,'menu_extraction_storage_receipt',{p_bucket:pointer.bucket,p_path:pointer.path}));
  if(!after||canonical(before)!==canonical(after))throw new CarteRouteError('source_changed',409);
  const inspection=await inspectMenuDocument(buffer,refs[i].pages);
  selected+=inspection.selectedPages.length;
  if(selected>8)throw new CarteRouteError('too_many_selected_pages',400);
  out.push({buffer,stat:{...inspection,id:refs[i].id,bucket:pointer.bucket,path:pointer.path,sha256,storageExpected:before}});
 }
 return out;
}
export async function renderExtractionSources(sources:InspectedSource[],signal?:AbortSignal){
 const images:VisionImage[]=[];
 for(const source of sources)images.push(...await renderMenuDocument(source.buffer,source.stat,signal));
 return images;
}
export async function reloadExtractionSources(auth:ExtractionAuth,stats:SourceStat[]):Promise<InspectedSource[]>{
 const out:InspectedSource[]=[];
 for(const stat of stats){
  if(!['documents','restaurant-cartes-private'].includes(stat.bucket)||!safePath(stat.path)||!/^[0-9a-f]{64}$/.test(stat.sha256)){
   throw new CarteRouteError('invalid_context',503);
  }
  const before=await extractionServiceRpc(auth,'menu_extraction_storage_receipt',{p_bucket:stat.bucket,p_path:stat.path});
  if(canonical(before)!==canonical(stat.storageExpected))throw new CarteRouteError('source_changed',409);
  const file=await auth.server.storage.from(stat.bucket).download(stat.path);
  if(file.error||!file.data||file.data.size>MAX_CARTE_BYTES)throw new CarteRouteError('source_unavailable',503);
  const buffer=Buffer.from(await file.data.arrayBuffer());
  if(createHash('sha256').update(buffer).digest('hex')!==stat.sha256)throw new CarteRouteError('source_changed',409);
  out.push({buffer,stat});
 }
 return out;
}
