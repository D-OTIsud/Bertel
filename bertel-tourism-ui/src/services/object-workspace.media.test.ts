import type { ObjectWorkspaceMediaItem, ObjectWorkspaceMediaModule } from './object-workspace-parser';
jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false }), subscribe: jest.fn(() => () => {}) } }));
import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { getObjectWorkspaceMediaModule, normalizeWorkspaceMediaItem, saveObjectWorkspaceMedia } from './object-workspace';
import { parseWorkspaceMediaItem } from './object-workspace-parser';
import { galleryBaseline, buildGalleryWritePayload, withGalleryWriteSnapshot } from './media-write-contract';

const ID='00000000-0000-4000-a000-00000000c101', TYPE='00000000-0000-4000-a000-00000000c102';
function item(patch: Partial<ObjectWorkspaceMediaItem>={}): ObjectWorkspaceMediaItem {
 return {id:ID,scope:'object',placeId:null,scopeLabel:'Objet principal',typeId:TYPE,typeCode:'photo',typeLabel:'Photo',
 title:'Façade',titleTranslations:{},description:'',descriptionTranslations:{},url:'https://example.test/photo.jpg',credit:'',visibility:'',
 position:'0',width:'',height:'',rightsExpiresAt:'',kind:'',isMain:true,isPublished:true,tags:['prefere'],...patch};
}
const raw=(patch:Record<string,unknown>={})=>({id:ID,object_id:'HOT1',place_id:null,media_type_id:TYPE,title:'Façade',url:'https://example.test/photo.jpg',
 visibility:null,is_main:true,is_published:true,position:0,updated_at:'2026-11-03T00:00:00+00:00',extra:{preserve:true},...patch});
function module(items=[item()]):ObjectWorkspaceMediaModule {
 const result: ObjectWorkspaceMediaModule={typeOptions:[{id:TYPE,code:'photo',label:'Photo'}],tagOptions:[],objectItems:items,placeItems:[],placeScopeUnavailableReason:null,unavailableReason:null};
 return {...result,galleryWriteBaseline:galleryBaseline(result,items.map(value=>raw({id:value.id})))};
}
function mockClient(fail=false,rows:Record<string,unknown>[]=[]){
 const tables=new Set<string>();const writes=jest.fn();
 const from=(table:string)=>{tables.add(table);const chain:Record<string,unknown>={select:()=>chain,eq:()=>chain,in:()=>chain,order:()=>chain,
 update:writes,insert:writes,delete:writes,then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:table==='media'?rows:[],error:fail&&table==='media'?{message:'boom'}:null}).then(resolve)};return chain;};
 const rpc=jest.fn(async()=>({data:{success:true,snapshot:[raw()],replayed:false},error:null}));
 const client={from,schema:()=>({rpc})};jest.mocked(getSupabaseClient).mockReturnValue(client as never);jest.mocked(getApiClient).mockReturnValue(client as never);
 return {rpc,tables,writes};
}
afterEach(()=>jest.clearAllMocks());

test('la normalisation et le parser ne rendent pas publique une visibilité NULL',()=>{
 expect(normalizeWorkspaceMediaItem({row:raw(),typeById:new Map(),tagsByMediaId:new Map(),placeLabelById:new Map()}).visibility).toBe('');
 expect(normalizeWorkspaceMediaItem({row:raw({visibility:'partners'}),typeById:new Map(),tagsByMediaId:new Map(),placeLabelById:new Map()}).visibility).toBe('partners');
 expect(parseWorkspaceMediaItem({record:{id:ID},index:0,scope:'object',scopeLabel:'Objet principal'}).visibility).toBe('');
});
test('un changement de titre laisse la visibilité NULL et toutes les colonnes non modifiées hors du patch',()=>{
 const input=module();input.objectItems=[item({title:'Nouvelle façade'})];
 expect(buildGalleryWritePayload(input)).toMatchObject({rows:[{id:ID,expected:raw(),changes:{title:'Nouvelle façade'}}],deleted:[]});
 expect(buildGalleryWritePayload(input).rows[0].changes).toEqual({title:'Nouvelle façade'});
});
test('une visibilité choisie explicitement est persistée ; un nouvel ajout seul reçoit le défaut public',()=>{
 const input=module();input.objectItems=[item({visibility:'private'})];
 expect(buildGalleryWritePayload(input).rows[0].changes).toEqual({visibility:'private'});
 const created=module([]);created.objectItems=[item({id:'draft-one',visibility:''})];
 const first=buildGalleryWritePayload(created),again=buildGalleryWritePayload(created);
 expect(first.rows[0]).toMatchObject({expected:null,changes:{visibility:'public'}});
 expect(first.rows[0].id).toBe(again.rows[0].id);
});
test('le writer envoie un seul RPC et ne touche jamais media_tag ni les DML bruts',async()=>{
 const {rpc,writes,tables}=mockClient();const input=module();input.objectItems=[item({title:'Nouvelle façade'})];
 const result=await saveObjectWorkspaceMedia('HOT1',input,{canEditPlaceMedia:false});
 expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('save_object_gallery',{p_object_id:'HOT1',p_payload:expect.objectContaining({write_contract:'gallery-patch-v1',request_id:expect.stringMatching(/^[0-9a-f-]{36}$/),rows:[{id:ID,expected:raw(),changes:{title:'Nouvelle façade'}}],deleted:[]})});
 expect(writes).not.toHaveBeenCalled();expect(tables.has('media_tag')).toBe(false);expect(result).toHaveProperty('media.galleryWriteBaseline.readId');
});
test('la suppression est explicite, limitée au cliché chargé et garde son updated_at',()=>{
 const input=module();input.objectItems=[];
 expect(buildGalleryWritePayload(input)).toEqual({write_contract:'gallery-patch-v1',rows:[],deleted:[{id:ID,expected:raw()}]});
});
test('le reçu actualise seulement la galerie racine et conserve les sous-lieux et tags',()=>{
 const input=module();input.placeItems=[item({id:'place-photo',scope:'place',placeId:'place'})];
 const output=withGalleryWriteSnapshot(input,[raw({title:'Titre confirmé'})]);
 expect(output.objectItems[0]).toMatchObject({title:'Titre confirmé',tags:['prefere'],visibility:''});
 expect(output.placeItems).toBe(input.placeItems);expect(output.galleryWriteBaseline?.readId).not.toBe(input.galleryWriteBaseline?.readId);
});
test('une lecture partielle ou une baseline absente interdit toute écriture',async()=>{
 const {rpc,writes}=mockClient(true);
 const failed=await getObjectWorkspaceMediaModule('HOT1',module(),new Map(),{refCodeByDomain:{},tables:{}});
 expect(failed.unavailableReason).toBeTruthy();expect(failed.objectItems).toEqual([]);
 await expect(saveObjectWorkspaceMedia('HOT1',failed,{canEditPlaceMedia:false})).rejects.toThrow(failed.unavailableReason!);
 const missing=module();delete missing.galleryWriteBaseline;
 await expect(saveObjectWorkspaceMedia('HOT1',missing,{canEditPlaceMedia:false})).rejects.toThrow('Rechargez');
 expect(rpc).not.toHaveBeenCalled();expect(writes).not.toHaveBeenCalled();
});
test('une lecture réussie attache les données brutes et une identité de lecture à la baseline',async()=>{
 mockClient(false,[raw()]);const loaded=await getObjectWorkspaceMediaModule('HOT1',module(),new Map(),{refCodeByDomain:{},tables:{}});
 expect(loaded.unavailableReason).toBeNull();expect(loaded.galleryWriteBaseline?.rows).toEqual([raw()]);
 expect(loaded.galleryWriteBaseline?.readId).toMatch(/^[0-9a-f-]{36}$/);
});
