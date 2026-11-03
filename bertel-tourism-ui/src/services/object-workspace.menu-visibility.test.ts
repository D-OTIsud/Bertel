jest.mock('./notification-delivery', () => ({ pingNotifyDrain: jest.fn() }));
jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false }) } }));

import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { parseObjectWorkspace } from './object-workspace-parser';
import { saveObjectWorkspaceMenus } from './object-workspace';
import { withMenusWriteSnapshot } from './menu-write-contract';

beforeEach(()=>jest.clearAllMocks());
describe('atomic menu saver and initially NULL visibility', () => {
  it.each([['',null],['private','private'],['partners','partners'],['public','public']])('saves explicit %p as %p',async(visibility,expected)=>{
    const snapshot={menus:[{id:'00000000-0000-4000-a000-000000008701',object_id:'RES1',name:'Menu',category_id:null,description:null,is_active:true,visibility:null,position:1}],items:[],media:[],dietary:[],allergens:[],cuisines:[]};
    const input=withMenusWriteSnapshot(parseObjectWorkspace({id:'RES1',name:'Test',type:'RES',raw:{}},['fr']).menus,snapshot);
    input.items[0].visibility=''; input.menuWriteBaseline!.models[0].visibility='';
    input.items[0].visibility=visibility!;
    const rpc=jest.fn().mockResolvedValue({data:{snapshot},error:null});
    (getApiClient as jest.Mock).mockReturnValue({schema:()=>({rpc})});
    const result=await saveObjectWorkspaceMenus('RES1',input);
    const payload=rpc.mock.calls[0][1].p_payload;
    expect(rpc).toHaveBeenCalledWith('save_object_menus',expect.objectContaining({p_object_id:'RES1'}));
    expect(payload.menus).toEqual(expected===null?[]:[expect.objectContaining({changes:{visibility:expected}})]);
    expect(getSupabaseClient).not.toHaveBeenCalled();
    expect(result?.menus?.menuWriteBaseline?.snapshot).toEqual(snapshot);
  });
  it('preserves the draft when the server reports a concurrent change',async()=>{
    const input=withMenusWriteSnapshot(parseObjectWorkspace({id:'RES1',name:'Test',type:'RES',raw:{}},['fr']).menus,{menus:[],items:[],media:[],dietary:[],allergens:[],cuisines:[]});
    (getApiClient as jest.Mock).mockReturnValue({schema:()=>({rpc:jest.fn().mockResolvedValue({data:null,error:{code:'PT409',message:'Le menu a changé'}})})});
    await expect(saveObjectWorkspaceMenus('RES1',input)).rejects.toThrow(/ont changé.*Rechargez.*saisie est conservée/);
    expect(input.menuWriteBaseline?.snapshot.menus).toEqual([]);
  });
});
