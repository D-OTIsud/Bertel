/** @jest-environment node */
import { inspectExtractionSources,reloadExtractionSources,type ExtractionAuth } from './_shared';
import { inspectMenuDocument } from '@/lib/menu-document-pages.server';
import { digest } from '../../restaurant-carte/_shared';
jest.mock('next/server',()=>({NextResponse:{json:jest.fn()}}));
jest.mock('@/lib/menu-document-pages.server',()=>({inspectMenuDocument:jest.fn(),renderMenuDocument:jest.fn()}));
const ID='00000000-0000-4000-a000-00000000e301',ID2='00000000-0000-4000-a000-00000000e302';
const PDF=Buffer.from('%PDF-1.4 synthetic source'),rpc=jest.fn(),download=jest.fn(),from=jest.fn();
const stat=()=>({id:'storage-id',bucket:'documents',path:'RESRUN999999E301/cartes/source.pdf',version:'v1',metadata:{size:PDF.length},updatedAt:'2026-11-03T00:00:00Z'});
const row=()=>({id:ID,kind:'carte',storageBucket:'documents',storagePath:stat().path,url:'https://project.example/storage/v1/object/public/documents/'+stat().path});
const auth={ok:true,jwt:'caller',userId:ID,server:{schema:()=>({rpc}),storage:{from}}} as unknown as ExtractionAuth;
beforeEach(()=>{
 jest.clearAllMocks();process.env.NEXT_PUBLIC_SUPABASE_URL='https://project.example';
 from.mockReturnValue({download});rpc.mockImplementation(async()=>({data:stat(),error:null}));
 download.mockResolvedValue({data:new Blob([PDF]),error:null});
 jest.mocked(inspectMenuDocument).mockResolvedValue({mimeType:'application/pdf',pageCount:2,selectedPages:[1,2]});
});
test('server inspection persists actual hash, Storage fingerprint and actual selected page count',async()=>{
 const inspected=await inspectExtractionSources(auth,{sources:[row()]},[{kind:'carte',id:ID}]);
 expect(inspected[0].stat).toMatchObject({sha256:digest(PDF),pageCount:2,selectedPages:[1,2],storageExpected:stat()});
 expect(inspectMenuDocument).toHaveBeenCalledWith(PDF,undefined);expect(download).toHaveBeenCalledWith(stat().path);
});
test.each(['https://attacker.example/a.pdf','https://project.example/storage/v1/object/public/actor-documents/private.pdf','https://project.example/storage/v1/object/public/documents/%2e%2e/private.pdf'])('legacy URL %s never becomes an arbitrary fetch',async url=>{
 await expect(inspectExtractionSources(auth,{sources:[{id:ID,kind:'carte',url}]},[{kind:'carte',id:ID}])).rejects.toMatchObject({code:'upload_source_required'});
 expect(download).not.toHaveBeenCalled();
});
test('Storage version changed during download rejects the inspection',async()=>{
 rpc.mockResolvedValueOnce({data:stat(),error:null}).mockResolvedValueOnce({data:{...stat(),version:'v2'},error:null});
 await expect(inspectExtractionSources(auth,{sources:[row()]},[{kind:'carte',id:ID}])).rejects.toMatchObject({code:'source_changed',status:409});
 expect(inspectMenuDocument).not.toHaveBeenCalled();
});
test('selection limit is cumulative over sources and never silently truncates',async()=>{
 jest.mocked(inspectMenuDocument).mockResolvedValueOnce({mimeType:'application/pdf',pageCount:8,selectedPages:[1,2,3,4,5,6,7,8]}).mockResolvedValueOnce({mimeType:'application/pdf',pageCount:1,selectedPages:[1]});
 await expect(inspectExtractionSources(auth,{sources:[row(),{...row(),id:ID2}]},[{kind:'carte',id:ID},{kind:'carte',id:ID2}])).rejects.toMatchObject({code:'too_many_selected_pages'});
});
test('resume checks fingerprint and file hash before rasterizing stored pages',async()=>{
 const stored={...stat(),id:ID,sha256:digest(PDF),storageExpected:stat(),mimeType:'application/pdf',pageCount:2,selectedPages:[1,2]};
 download.mockResolvedValueOnce({data:new Blob(['changed bytes']),error:null});
 await expect(reloadExtractionSources(auth,[stored])).rejects.toMatchObject({code:'source_changed',status:409});
 expect(inspectMenuDocument).not.toHaveBeenCalled();
});
