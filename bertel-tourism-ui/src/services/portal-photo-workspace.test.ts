import { getApiClient } from "../lib/supabase";
import { getPortalPhotoWorkspace, reconcilePortalPhotoOrder, updatePortalPhotoTexts } from "./portal-photo-workspace";

jest.mock("../lib/supabase", () => ({ getApiClient: jest.fn() }));
const rpc = jest.fn();
const raw = {revision:"42",title: null, description: "ancienne", title_i18n: {fr:"Accueil",en:"Welcome"}, description_i18n:null};
const order = [{id:"media-1",revision:"42",position:null,isMain:null}];
const workspace = {
  published: [{id:"media-1",url:"/photo.jpg",title:"Accueil",description:"ancienne",credit:"Auteur",position:null,isMain:null,portalDocumentId:null,textSnapshot:raw}],
  proposals: [], capacity:{limit:20,published:1,reserved:0,used:1,remaining:19}, analysisEnabled:false, writesEnabled:true,
  orderSnapshot:order,orderNeedsNormalization:true,
};
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({data:workspace,error:null});
  jest.mocked(getApiClient).mockReturnValue({schema:()=>({rpc})} as unknown as ReturnType<typeof getApiClient>);
});

test('préserve la version brute pour le comparatif même si le titre affiché est traduit',async () => {
  const result = await getPortalPhotoWorkspace("FICHE");
  expect(result.published[0]).toMatchObject({title:"Accueil",isMain:false,textSnapshot:raw});
  expect(result.orderSnapshot).toEqual(order);
  await updatePortalPhotoTexts({objectId:"FICHE",target:"proposal",id:"doc-1",title:"Titre",description:"Description",expected:raw});
  expect(rpc).toHaveBeenLastCalledWith("update_portal_photo_proposal_texts",{
    p_object_id:"FICHE",p_document_id:"doc-1",p_expected:raw,p_title:"Titre",p_description:"Description",
  });
  await reconcilePortalPhotoOrder("FICHE",["media-1"],result.orderSnapshot);
  expect(rpc).toHaveBeenLastCalledWith("reconcile_portal_photo_order",{p_object_id:"FICHE",p_media_ids:["media-1"],p_expected:order});
});

test('une réponse incomplète ne devient pas une galerie vide modifiable', async () => {
  rpc.mockResolvedValue({data:{...workspace,orderSnapshot:undefined},error:null});
  await expect(getPortalPhotoWorkspace("FICHE")).rejects.toThrow("incomplète");
});
test('un conflit conserve son code pour permettre le rapprochement dans la modale', async () => {
  rpc.mockResolvedValue({data:null,error:{code:"PT409",details:"photo_text_conflict"}});
  await expect(updatePortalPhotoTexts({objectId:"FICHE",target:"published",id:"media-1",title:"Titre",description:"Description",expected:raw})).rejects.toMatchObject({code:"PT409",details:"photo_text_conflict"});
  expect(rpc).toHaveBeenCalledWith("update_portal_photo_texts",expect.objectContaining({p_media_id:"media-1",p_expected:raw}));
});
test.each(["photo_main_conflict","photo_writes_closed","photo_order_conflict"])("transmet le motif de classement %s",async details=>{
  rpc.mockResolvedValue({data:null,error:{code:"PT409",details}});
  await expect(reconcilePortalPhotoOrder("FICHE",["media-1"],order)).rejects.toMatchObject({code:"PT409",details});
});

test.each(['title_i18n', 'description_i18n'] as const)('refuse un snapshot incomplet sans %s', async key => {
  const incomplete = { ...raw };
  delete (incomplete as Partial<typeof raw>)[key];
  rpc.mockResolvedValue({data:{...workspace,published:[{...workspace.published[0],textSnapshot:incomplete}]},error:null});
  await expect(getPortalPhotoWorkspace('FICHE')).rejects.toThrow('La galerie reçue est incomplète. Actualisez avant de la modifier.');
});

test('préserve une proposition et son reçu analyse non vide sous Zod 4', async () => {
  const proposal = {documentId:'doc-1',title:'Titre',description:'Description',status:'refused',replaceMediaId:null,changeId:'change-1',
    submittedAt:'2026-11-06T00:00:00Z',reviewNote:'À vérifier',textSnapshot:raw,canAppeal:false,reviewAppeal:null,
    analysis:{requestId:'request-1',state:'complete',assessment:{score:8,summary:' Sujet net ',strengths:[' Belle lumière '],issues:[]},
      sourceCurrent:true,appealInteractionId:null,appealStatus:null}};
  rpc.mockResolvedValue({data:{...workspace,proposals:[proposal]},error:null});
  const result = await getPortalPhotoWorkspace('FICHE');
  expect(result.proposals).toHaveLength(1);
  expect(result.proposals[0]).toEqual({...proposal,analysis:{...proposal.analysis,assessment:{score:8,summary:'Sujet net',strengths:['Belle lumière'],issues:[]}}});
});
