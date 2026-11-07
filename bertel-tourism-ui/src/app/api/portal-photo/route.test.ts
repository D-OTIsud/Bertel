/** @jest-environment node */
import {POST as uploadPhoto} from './upload/route';
import {POST as previewPhoto} from './preview/route';
import {POST as approvePhotos} from './approve/route';
import {authenticated,callerClient} from '../_document-auth';
import {processImage} from '../media/upload/process-image';
jest.mock('../_document-auth',()=>({authenticated:jest.fn(),callerClient:jest.fn(),PRIVATE_BUCKET:'actor-documents',UUID_SHAPE:/^[0-9a-f-]{36}$/i,rejectOversizedBody:()=>null}));
jest.mock('../media/upload/process-image',()=>({MAX_INPUT_BYTES:20*1024*1024,MediaProcessingError:class extends Error{code='mime';},processImage:jest.fn(async()=>({buffer:Buffer.from('clean JPEG'),width:1800,height:1200,mimeType:'image/jpeg'}))}));
jest.mock('@/lib/request-body.server',()=>({...jest.requireActual('@/lib/request-body.server'),readBoundedFormData:jest.fn(req=>req.formData()),readBoundedJson:jest.fn(req=>req.json())}));
const DOC='00000000-0000-4000-a000-000000008404',ACTOR='00000000-0000-4000-a000-000000008402',PC='00000000-0000-4000-a000-000000008410';
const rpc=jest.fn(),serviceRpc=jest.fn(),upload=jest.fn(),remove=jest.fn(),download=jest.fn(),sign=jest.fn(),from=jest.fn();let claim='';
function req(body:unknown={},form?:FormData):never{return {headers:new Headers(),json:async()=>body,formData:async()=>form} as never;}
function photoForm(rights='true',file=new File(['raw image'],'image.jpg',{type:'image/jpeg'})){
 const f=new FormData();f.append('object_id','HOTRUN9999998401');f.append('file',file);f.append('rights',rights);f.append('upload_id',DOC);return f;
}
function approvalPath(claimId: string) { return `portal-approved/${DOC}/${claimId}.jpg`; }
function context(){return {data:{documents:[{id:DOC,bucket:'actor-documents',path:`portal-photos/${ACTOR}/source.jpg`,publicPath:approvalPath(claim)}]},error:null};}
beforeEach(()=>{
 jest.clearAllMocks();claim='';upload.mockResolvedValue({error:null});remove.mockResolvedValue({error:null});sign.mockResolvedValue({data:{signedUrl:'https://private.test/signed'},error:null});download.mockResolvedValue({data:new Blob(['clean JPEG']),error:null});serviceRpc.mockImplementation(async(name)=>({data:name==='complete_portal_photo_upload'?{id:DOC,title:'image.jpg',width:1800,height:1200}:[],error:null}));
 rpc.mockImplementation(async(name,args)=>{if(name==='portal_photo_upload_context')return{data:{actorId:ACTOR},error:null};if(name==='reserve_portal_photo_upload')return{data:{id:DOC,actorId:ACTOR,path:`portal-photos/${ACTOR}/${DOC}.jpg`,ready:false},error:null};if(name==='portal_photo_preview')return{data:{bucket:'actor-documents',path:`portal-photos/${ACTOR}/source.jpg`},error:null};if(name==='prepare_portal_photo_approval'){claim=args.p_claim_id;return context();}return{data:{applied_count:1,submission_status:'approved'},error:null};});
 from.mockImplementation(table=>({
  insert:(data:Record<string,unknown>)=>table==='ref_document'?{select:()=>({single:async()=>({data:{id:data.id},error:null})})}:Promise.resolve({error:null}),
  select:()=>({eq:()=>({maybeSingle:async()=>({data:{extra:{approval_claim_id:claim}},error:null})})}),
  update:()=>{const chain={eq:()=>chain,select:()=>({single:async()=>({data:{id:DOC},error:null})})};return chain;},delete:()=>({eq:async()=>({error:null})})
 }));
 const server={from,schema:()=>({rpc:serviceRpc}),storage:{from:()=>({upload,remove,download,createSignedUrl:sign,getPublicUrl:()=>({data:{publicUrl:'https://public.test/approved.jpg'}})})}};
 jest.mocked(authenticated).mockResolvedValue({ok:true,userId:'office-user',jwt:'caller-token',server} as never);jest.mocked(callerClient).mockReturnValue({schema:()=>({rpc})} as never);
});
test('aucun fichier lu ou écrit sans authentification',async()=>{
 jest.mocked(authenticated).mockResolvedValue({ok:false,response:new Response(null,{status:401})} as never);
 expect((await uploadPhoto(req({},photoForm()))).status).toBe(401);expect((await previewPhoto(req({documentId:DOC}))).status).toBe(401);expect((await approvePhotos(req({id:PC,batch:false,manual:false}))).status).toBe(401);
 expect(upload).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled();
});
test('un corps JSON trop grand est borné sur le flux avant toute autorisation de fichier',async()=>{
 const{readBoundedJson:real}=jest.requireActual('@/lib/request-body.server');
 const{readBoundedJson}=jest.requireMock('@/lib/request-body.server') as{readBoundedJson:jest.Mock};readBoundedJson.mockImplementationOnce(real);
 const request=new Request('http://internal.test/api/portal-photo/approve',{method:'POST',body:JSON.stringify({padding:'x'.repeat(21*1024)})});
 expect((await approvePhotos(request as never)).status).toBe(413);expect(rpc).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();
});
test('fiche d’un autre partenaire refusée avant traitement et stockage',async()=>{
 rpc.mockResolvedValue({data:null,error:{code:'42501'}});expect((await uploadPhoto(req({},photoForm()))).status).toBe(403);expect(processImage).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled();
});
test('droits de diffusion requis et 20 Mo maximum',async()=>{
 expect((await uploadPhoto(req({},photoForm('false')))).status).toBe(400);
 expect((await uploadPhoto(req({},photoForm('true',new File([new Uint8Array(20*1024*1024+1)],'large.jpg',{type:'image/jpeg'}))))).status).toBe(413);expect(upload).not.toHaveBeenCalled();
});
test('le dépôt du partenaire reste exclusivement privé et utilise les octets traités',async()=>{
 const result=await uploadPhoto(req({},photoForm()));expect(result.status).toBe(201);
 expect(upload).toHaveBeenCalledTimes(1);expect(upload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^portal-photos/${ACTOR}/`)),Buffer.from('clean JPEG'),expect.objectContaining({contentType:'image/jpeg',upsert:false}));
 expect(upload.mock.calls[0][0]).not.toContain('portal-approved');
 expect(rpc).toHaveBeenCalledWith('reserve_portal_photo_upload',{p_object_id:'HOTRUN9999998401',p_upload_id:DOC,p_replace_media_id:null});
 expect(rpc.mock.invocationCallOrder[1]).toBeLessThan(upload.mock.invocationCallOrder[0]);
 expect(serviceRpc).toHaveBeenCalledWith('complete_portal_photo_upload',expect.objectContaining({p_user_id:'office-user',p_document_id:DOC,p_sha256:expect.stringMatching(/^[0-9a-f]{64}$/)}));
 expect(from).not.toHaveBeenCalled();
});

test('la vingt-et-unième réservation est refusée avant toute écriture Storage',async()=>{
 rpc.mockImplementation(async(name)=>name==='portal_photo_upload_context'?{data:{actorId:ACTOR},error:null}:{data:null,error:{code:'PT409',details:'photo_limit'}});
 const result=await uploadPhoto(req({},photoForm()));expect(result.status).toBe(409);expect(await result.json()).toEqual({error:'photo_limit'});expect(upload).not.toHaveBeenCalled();expect(serviceRpc).not.toHaveBeenCalled();
});
test('un ancien client sans identifiant de dépôt ne contourne pas la réservation',async()=>{
 const form=photoForm();form.delete('upload_id');expect((await uploadPhoto(req({},form))).status).toBe(400);expect(upload).not.toHaveBeenCalled();
});
test('un même dépôt expiré ne crée pas de nouvelle copie et demande un nouveau choix explicite',async()=>{
 rpc.mockImplementation(async(name)=>name==='portal_photo_upload_context'?{data:{actorId:ACTOR},error:null}:{data:null,error:{code:'PT409',details:'reservation_expired'}});
 const result=await uploadPhoto(req({},photoForm()));expect(result.status).toBe(409);expect(await result.json()).toEqual({error:'upload_expired'});expect(upload).not.toHaveBeenCalled();
});
test('une réponse Storage perdue est reprise seulement si les octets privés correspondent',async()=>{
 upload.mockResolvedValue({error:{message:'already exists'}});
 expect((await uploadPhoto(req({},photoForm()))).status).toBe(201);expect(download).toHaveBeenCalledWith(`portal-photos/${ACTOR}/${DOC}.jpg`);expect(remove).not.toHaveBeenCalled();
 download.mockResolvedValue({data:new Blob(['other bytes']),error:null});
 expect((await uploadPhoto(req({},photoForm()))).status).toBe(409);expect(serviceRpc).toHaveBeenCalledTimes(1);expect(remove).not.toHaveBeenCalled();
});
test('une finalisation incertaine conserve les octets et le même identifiant pour la reprise',async()=>{
 serviceRpc.mockResolvedValue({data:null,error:{message:'network lost'}});
 expect((await uploadPhoto(req({},photoForm()))).status).toBe(503);expect(remove).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled();
});
test('une reprise déjà finalisée retourne le reçu sans recopier le fichier',async()=>{
 const {createHash}=await import('node:crypto');const hash=createHash('sha256').update('clean JPEG').digest('hex');
 rpc.mockImplementation(async(name)=>name==='portal_photo_upload_context'?{data:{actorId:ACTOR},error:null}:{data:{id:DOC,actorId:ACTOR,path:`portal-photos/${ACTOR}/${DOC}.jpg`,ready:true,sha256:hash,title:'image.jpg',width:1800,height:1200},error:null});
 expect((await uploadPhoto(req({},photoForm()))).status).toBe(200);expect(upload).not.toHaveBeenCalled();expect(serviceRpc).not.toHaveBeenCalled();
});
test('aperçu signé 120 s après le gate, aucune URL de bucket arbitraire',async()=>{
 expect((await previewPhoto(req({documentId:DOC}))).status).toBe(200);expect(sign).toHaveBeenCalledWith(`portal-photos/${ACTOR}/source.jpg`,120);
 sign.mockClear();rpc.mockResolvedValue({data:{bucket:'media',path:'forged.jpg'},error:null});expect((await previewPhoto(req({documentId:DOC}))).status).toBe(403);expect(sign).not.toHaveBeenCalled();
});
test('un partenaire ou un office non habilité ne déclenche aucune copie publique',async()=>{
 rpc.mockResolvedValue({data:null,error:{code:'42501'}});expect((await approvePhotos(req({id:PC,batch:false,manual:false}))).status).toBe(403);expect(download).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled();
});
test('approbation : droits appelant, copie enregistrée par le serveur, puis validation SQL appelant',async()=>{
 const result=await approvePhotos(req({id:PC,batch:false,manual:false}));expect(result.status).toBe(200);
 expect(download).toHaveBeenCalledWith(`portal-photos/${ACTOR}/source.jpg`);expect(upload).toHaveBeenCalledWith(approvalPath(claim),Buffer.from('clean JPEG'),expect.objectContaining({upsert:false,contentType:'image/jpeg'}));
 expect(rpc).toHaveBeenLastCalledWith('approve_pending_change',{p_id:PC,p_review_note:null,p_applied_manually:false});expect(callerClient).toHaveBeenCalledWith('caller-token');
});
test('un échec de validation retire seulement les copies confirmées sans média canonique',async()=>{
 rpc.mockImplementation(async(name,args)=>{if(name==='prepare_portal_photo_approval'){claim=args.p_claim_id;return context();}return{error:{code:'22023'},data:null};});
 serviceRpc.mockImplementation(async (_name, args) => ({data:[
   approvalPath(args.p_claim_id), `portal-approved/${DOC}.jpg`, approvalPath(PC),
 ],error:null}));
 const result=await approvePhotos(req({id:PC,batch:false,manual:false}));expect(result.status).toBe(500);expect(remove).toHaveBeenCalledWith([approvalPath(claim)]);
});
test('réponse SQL perdue après application : la compensation ne supprime aucune photo publiée',async()=>{
 rpc.mockImplementation(async(name,args)=>{if(name==='prepare_portal_photo_approval'){claim=args.p_claim_id;return context();}return{error:{message:'Network lost'},data:null};});
 serviceRpc.mockResolvedValue({data:[],error:null});const result=await approvePhotos(req({id:PC,batch:true,manual:false}));expect(result.status).toBe(500);expect(remove).not.toHaveBeenCalled();
});
test('réessayer une approbation déjà appliquée confirme le résultat sans copier ni approuver deux fois',async()=>{
 rpc.mockResolvedValue({data:{documents:[],alreadyApplied:true},error:null});const result=await approvePhotos(req({id:PC,batch:false,manual:false}));expect(result.status).toBe(200);expect(download).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledTimes(1);
});

test('un DELETE différé de la tentative A préserve la copie publiée par B', async () => {
  const stored = new Map<string, Buffer>();
  const claims: string[] = [];
  let approvals = 0;
  let releaseDelete!: () => void;
  const deleteAllowed = new Promise<void>(resolve => { releaseDelete = resolve; });
  let deletionStarted!: (paths: string[]) => void;
  const waitingForDelete = new Promise<string[]>(resolve => { deletionStarted = resolve; });
  upload.mockImplementation(async (path: string, bytes: Buffer) => {
    stored.set(path, bytes);
    return {error: null};
  });
  remove.mockImplementationOnce(async (paths: string[]) => {
    deletionStarted(paths);
    await deleteAllowed;
    for (const path of paths) stored.delete(path);
    return {error: null};
  });
  rpc.mockImplementation(async (name, args) => {
    if (name === 'prepare_portal_photo_approval') {
      claim = args.p_claim_id;
      claims.push(claim);
      return context();
    }
    approvals += 1;
    return approvals === 1 ? {data: null, error: {code: '22023'}} : {data: {status: 'applied'}, error: null};
  });
  serviceRpc.mockImplementation(async (_name, args) => ({data: [approvalPath(args.p_claim_id)], error: null}));

  const first = approvePhotos(req({id: PC, batch: false, manual: false}));
  try {
    const paths = await waitingForDelete;
    expect(paths).toEqual([approvalPath(claims[0])]);
    const second = await approvePhotos(req({id: PC, batch: false, manual: false}));
    expect(second.status).toBe(200);
  } finally {
    releaseDelete();
  }
  expect((await first).status).toBe(500);
  expect(claims[0]).not.toBe(claims[1]);
  expect(stored.get(approvalPath(claims[1]))).toEqual(Buffer.from('clean JPEG'));
});

test('un chemin historique renvoyé par le backend est refusé avant Storage', async () => {
  rpc.mockResolvedValue({data:{documents:[{
    id:DOC,bucket:'actor-documents',path:`portal-photos/${ACTOR}/source.jpg`,publicPath:`portal-approved/${DOC}.jpg`,
  }]},error:null});
  expect((await approvePhotos(req({id:PC,batch:false,manual:false}))).status).toBe(500);
  expect(download).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});
