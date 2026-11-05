import { act, renderHook, waitFor } from '@testing-library/react';
import { useObjectEditorState } from './useObjectEditorState';
import { cloneModules } from './editor-state';
import { fullModulesFixture } from './sections/section-fixture.test-utils';
import { galleryBaseline, buildGalleryWritePayload } from '../../services/media-write-contract';
import { saveObjectWorkspaceMedia } from '../../services/object-workspace';
import { getApiClient, getSupabaseClient } from '../../lib/supabase';
import type { ObjectWorkspaceMediaItem } from '../../services/object-workspace-parser';

jest.mock('../../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../../store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false, userId: 'office-media-test' }), subscribe: jest.fn(() => () => {}) } }));
const ID='00000000-0000-4000-a000-00000000f201', TYPE='00000000-0000-4000-a000-00000000f202';
const initialRow={id:ID,object_id:'ACTTST0000000001',place_id:null,media_type_id:TYPE,title:'Avant',title_i18n:null,
  description:null,description_i18n:null,credit:'Auteur',url:'https://example.test/photo.jpg',is_main:true,is_published:true,
  position:1,rights_expires_at:null,visibility:'public',width:1600,height:1200,kind:'illustration',updated_at:'2026-11-04T01:00:00Z',extra:{}};
const rpc=jest.fn();
function modules() {
  const full=fullModulesFixture();
  const item:ObjectWorkspaceMediaItem={id:ID,scope:'object',placeId:null,scopeLabel:'Objet principal',typeId:TYPE,typeCode:'photo',typeLabel:'Photo',
    title:'Avant',titleTranslations:{},description:'',descriptionTranslations:{},url:initialRow.url,credit:'Auteur',visibility:'public',position:'1',
    width:'1600',height:'1200',rightsExpiresAt:'',kind:'illustration',isMain:true,isPublished:true,tags:[]};
  const media={...full.media,typeOptions:[{id:TYPE,code:'photo',label:'Photo'}],objectItems:[item],placeItems:[],unavailableReason:null,placeScopeUnavailableReason:null};
  full.media={...media,galleryWriteBaseline:galleryBaseline(media,[initialRow])};
  return full;
}
beforeEach(()=>{
  localStorage.clear(); rpc.mockReset();
  const api={schema:()=>({rpc})};
  jest.mocked(getApiClient).mockReturnValue(api as never); jest.mocked(getSupabaseClient).mockReturnValue(api as never);
});

test('deux sauvegardes office successives réutilisent le nouveau snapshot et de nouvelles intentions',async()=>{
  const start=modules(),{result}=renderHook(()=>useObjectEditorState('ACTTST0000000001',start));
  let live={...initialRow};
  rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>{
    expect(name).toBe('save_object_gallery');
    const request=args.p_payload as {rows:Array<{changes:Record<string,unknown>}>};
    live={...live,...request.rows[0].changes,updated_at:live.updated_at==='2026-11-04T01:00:00Z'?'2026-11-04T02:00:00Z':'2026-11-04T03:00:00Z'};
    return{data:{success:true,snapshot:[live]},error:null};
  });
  const save=async()=>{
    const sent=cloneModules(result.current.draft);
    const canonical=await saveObjectWorkspaceMedia('ACTTST0000000001',sent.media,{canEditPlaceMedia:false});
    act(()=>result.current.commitModules(['media'],{canonicalModules:canonical||undefined,sentModules:sent}));
  };
  act(()=>result.current.replaceModule('media',{...result.current.draft.media,objectItems:[{...result.current.draft.media.objectItems[0],title:'Premier'}]}));
  await save(); expect(result.current.isDirty).toBe(false);
  expect(result.current.baseline.media.galleryWriteBaseline?.rows[0].updated_at).toBe('2026-11-04T02:00:00Z');
  act(()=>result.current.replaceModule('media',{...result.current.draft.media,objectItems:[{...result.current.draft.media.objectItems[0],description:'Deuxième'}]}));
  await save(); expect(result.current.isDirty).toBe(false);
  const requests=rpc.mock.calls.map((call)=>call[1].p_payload);
  expect(requests[1].rows[0].expected.updated_at).toBe('2026-11-04T02:00:00Z');
  expect(requests[1].request_id).not.toBe(requests[0].request_id);
  expect(result.current.draft.media.objectItems[0]).toMatchObject({title:'Premier',description:'Deuxième'});
});

test('la saisie pendant une réponse est conservée avec le nouveau CAS pour la sauvegarde suivante',async()=>{
  const start=modules(),{result}=renderHook(()=>useObjectEditorState('ACTTST0000000001',start));
  let deliver:((value:unknown)=>void)|undefined;
  rpc.mockImplementationOnce(()=>new Promise((resolve)=>{deliver=resolve;}));
  act(()=>result.current.replaceModule('media',{...result.current.draft.media,objectItems:[{...result.current.draft.media.objectItems[0],title:'Titre envoyé'}]}));
  const sent=cloneModules(result.current.draft);
  const pending=saveObjectWorkspaceMedia('ACTTST0000000001',sent.media,{canEditPlaceMedia:false});
  await waitFor(()=>expect(deliver).toBeDefined());
  act(()=>result.current.replaceModule('media',{...result.current.draft.media,objectItems:[{...result.current.draft.media.objectItems[0],description:'Saisie pendant la requête'}]}));
  deliver!({data:{success:true,snapshot:[{...initialRow,title:'Titre envoyé',updated_at:'2026-11-04T02:00:00Z'}]},error:null});
  const canonical=await pending;
  act(()=>result.current.commitModules(['media'],{canonicalModules:canonical||undefined,sentModules:sent}));
  expect(result.current.baseline.media.objectItems[0].description).toBe('');
  expect(result.current.draft.media.objectItems[0]).toMatchObject({title:'Titre envoyé',description:'Saisie pendant la requête'});
  expect(result.current.dirtySections.media).toBe(true);
  const next=buildGalleryWritePayload(result.current.draft.media);
  expect(next.rows[0]).toMatchObject({expected:{updated_at:'2026-11-04T02:00:00Z'},changes:{description:'Saisie pendant la requête'}});
  rpc.mockResolvedValueOnce({data:{success:true,snapshot:[{...initialRow,title:'Titre envoyé',description:'Saisie pendant la requête',updated_at:'2026-11-04T03:00:00Z'}]},error:null});
  const secondSent=cloneModules(result.current.draft);
  const second=await saveObjectWorkspaceMedia('ACTTST0000000001',secondSent.media,{canEditPlaceMedia:false});
  act(()=>result.current.commitModules(['media'],{canonicalModules:second||undefined,sentModules:secondSent}));
  expect(result.current.isDirty).toBe(false); expect(rpc).toHaveBeenCalledTimes(2);
});

test('création temporaire puis saisie en vol : UUID confirmé unique et deuxième save en update',async()=>{
  const start=modules(),{result}=renderHook(()=>useObjectEditorState('ACTTST0000000001',start));
  let deliver:((value:unknown)=>void)|undefined;
  let createdRow:Record<string,unknown>={};
  rpc.mockImplementationOnce((_name:string,args:Record<string,unknown>)=>{
    const request=args.p_payload as {rows:Array<{id:string;changes:Record<string,unknown>}>};
    const row=request.rows[0];
    createdRow={...row.changes,id:row.id,object_id:'ACTTST0000000001',place_id:null,updated_at:'2026-11-04T02:00:00Z',extra:{}};
    return new Promise(resolve=>{deliver=resolve;});
  });
  act(()=>result.current.replaceModule('media',{...result.current.draft.media,objectItems:[...result.current.draft.media.objectItems,
    {...result.current.draft.media.objectItems[0],id:'temporary-new-photo',title:' Nouvelle ',description:'',position:'2',isMain:false}]}));
  const sent=cloneModules(result.current.draft);
  const pending=saveObjectWorkspaceMedia('ACTTST0000000001',sent.media,{canEditPlaceMedia:false});
  await waitFor(()=>expect(deliver).toBeDefined());
  act(()=>result.current.replaceModule('media',{...result.current.draft.media,objectItems:result.current.draft.media.objectItems.map(item=>item.id==='temporary-new-photo'
    ?{...item,description:'Description tapée après envoi'}:item)}));
  deliver!({data:{success:true,snapshot:[initialRow,createdRow]},error:null});
  const canonical=await pending;
  act(()=>result.current.commitModules(['media'],{canonicalModules:canonical||undefined,sentModules:sent}));
  const uuid=String(createdRow.id);
  expect(result.current.draft.media.objectItems.map(item=>item.id)).toEqual([ID,uuid]);
  expect(result.current.draft.media.objectItems[1]).toMatchObject({title:'Nouvelle',description:'Description tapée après envoi'});
  expect(result.current.baseline.media.objectItems[1]).toMatchObject({id:uuid,description:''});
  const next=buildGalleryWritePayload(result.current.draft.media);
  expect(next.rows).toHaveLength(1); expect(next.rows[0]).toMatchObject({id:uuid,expected:{id:uuid,updated_at:'2026-11-04T02:00:00Z'},changes:{description:'Description tapée après envoi'}});
  rpc.mockResolvedValueOnce({data:{success:true,snapshot:[initialRow,{...createdRow,description:'Description tapée après envoi',updated_at:'2026-11-04T03:00:00Z'}]},error:null});
  const secondSent=cloneModules(result.current.draft);
  const second=await saveObjectWorkspaceMedia('ACTTST0000000001',secondSent.media,{canEditPlaceMedia:false});
  act(()=>result.current.commitModules(['media'],{canonicalModules:second||undefined,sentModules:secondSent}));
  expect(result.current.draft.media.objectItems).toHaveLength(2); expect(result.current.isDirty).toBe(false);
  expect(rpc).toHaveBeenCalledTimes(2);
});
