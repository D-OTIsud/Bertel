import { buildMenusWritePayload, withMenusWriteSnapshot, type MenuWriteSnapshot } from './menu-write-contract';
import { parseObjectWorkspace } from './object-workspace-parser';

const menuId='00000000-0000-4000-a000-000000008701';
const itemId='00000000-0000-4000-a000-000000008702';
const secondId='00000000-0000-4000-a000-000000008703';
const snapshot=():MenuWriteSnapshot => ({
  menus:[{ id:menuId,object_id:'RES1',name:'Carte',category_id:null,description:null,is_active:true,visibility:null,position:1,updated_at:'2026-01-01' }],
  items:[{ id:itemId,menu_id:menuId,name:'Cari',description:null,price:18,currency:'EUR',kind_id:null,unit_id:null,media_id:null,is_available:true,position:1,section_id:null,updated_at:'2026-01-01' }],
  media:[],dietary:[],allergens:[],cuisines:[],
});
const moduleWith=(value=snapshot()) => withMenusWriteSnapshot(parseObjectWorkspace({id:'RES1',name:'Restaurant',type:'RES',raw:{}},['fr']).menus,value);

it('sends only the edited field and the exact raw baseline, preserving IDs and nulls',()=>{
  const input=moduleWith(); input.items[0].items[0].price='19';
  const payload=buildMenusWritePayload(input);
  expect(payload.menus).toEqual([]); expect(payload.deleted_menus).toEqual([]); expect(payload.deleted_items).toEqual([]);
  expect(payload.items).toEqual([{ id:itemId,menu_id:menuId,expected:snapshot().items[0],changes:{price:19},links:{} }]);
});
it('refuses saving without a reliable baseline before any write',()=>{
  const input=moduleWith(); delete input.menuWriteBaseline;
  expect(()=>buildMenusWritePayload(input)).toThrow(/Rechargez/);
});
it('deletes only a known item, with all metadata and associated links in its precondition',()=>{
  const before=snapshot(); before.media=[{menu_item_id:itemId,media_id:secondId,position:1,created_at:'old'}];
  const input=moduleWith(before); input.items[0].items=[];
  expect(buildMenusWritePayload(input).deleted_items).toEqual([{id:itemId,menu_id:menuId,expected:{row:before.items[0],media:before.media,dietary:[],allergens:[],cuisines:[]}}]);
});
it('reattaches off-screen rows from canonical confirmation and creates a fresh baseline',()=>{
  const input=moduleWith(); const confirmed=snapshot();
  confirmed.menus.push({...confirmed.menus[0],id:secondId,name:'Ajout concurrent'});
  const result=withMenusWriteSnapshot(input,confirmed);
  expect(result.items.map(row=>row.recordId)).toEqual([menuId,secondId]);
  result.items[0].name='local typing';
  expect(result.menuWriteBaseline!.models[0].name).toBe('Carte');
});
it('uses stable new IDs and produces the same payload for a lost-response retry',()=>{
  const input=moduleWith();
  input.items.push({...input.items[0],recordId:secondId,name:'Desserts',items:[]});
  const first=buildMenusWritePayload(input);
  expect(first.menus).toEqual([expect.objectContaining({id:secondId,expected:null})]);
  expect(buildMenusWritePayload(input)).toEqual(first);
});
