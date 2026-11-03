/** @jest-environment node */
import { POST as uploadCarte } from './upload/route';
import { POST as mutateCarte, GET as listCartes } from './route';
import { POST as previewCarte } from './preview/route';
import { POST as operationStatus } from './status/route';
import { authenticated, callerClient } from '../_document-auth';
import { processImage } from '../media/upload/process-image';
import { digest, MAX_CARTE_BYTES } from './_shared';
import { readBoundedFormData } from '@/lib/request-body.server';

jest.mock('next/server', () => ({ NextResponse: { json: (value: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(value), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }) } }));
jest.mock('../_document-auth', () => ({
  authenticated: jest.fn(), callerClient: jest.fn(),
  UUID_SHAPE: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
}));
jest.mock('../media/upload/process-image', () => {
  const actual = jest.requireActual('../media/upload/process-image');
  return { ...actual, processImage: jest.fn() };
});
jest.mock('@/lib/request-body.server', () => ({
  readBoundedJson: jest.fn((req: Request) => req.json()),
  readBoundedFormData: jest.fn((req: Request) => req.formData()),
  assertFormDataShape: jest.fn(),
  acquireLease: jest.fn(() => ({ release: jest.fn() })),
  BodyTooLargeError: class extends Error {},
}));
const OBJECT = 'RESRUN999999C101', ID = '00000000-0000-4000-a000-00000000c101';
const DOC = '00000000-0000-4000-a000-00000000c102', MUTATION = '00000000-0000-4000-a000-00000000c103';
const PDF = Buffer.from('%PDF-1.4\ncarte fixture');
const PUBLIC_URL = 'https://project.example/storage/v1/object/public/documents/' + OBJECT + '/cartes/' + ID + '.pdf';
const rpc = jest.fn(), serviceRpc = jest.fn(), upload = jest.fn(), copy = jest.fn(), download = jest.fn(), sign = jest.fn(), remove = jest.fn();
const storageFrom = jest.fn();
function receipt(state = 'staged') {
 return { id: ID, objectId: OBJECT, documentId: DOC, filename: 'carte.pdf', sha256: digest(PDF), byteSize: PDF.length,
  mimeType: 'application/pdf', state, stagingBucket: 'restaurant-cartes-private',
  stagingPath: 'restaurant-cartes/' + OBJECT + '/' + ID + '.pdf', publicBucket: 'documents',
  publicPath: OBJECT + '/cartes/' + ID + '.pdf', publicUrl: state === 'copied' ? PUBLIC_URL : null };
}
const result = () => ({ requestId: MUTATION, cartes: [{ documentId: DOC, url: PUBLIC_URL }] });
const payload = () => ({ objectId: OBJECT, requestId: MUTATION,
 payload: { write_contract: 'restaurant-carte-v1', action: 'publish', upload_id: ID, expected: null, patch: { title: 'Carte' } } });
const request = (body: unknown = {}) => new Request('https://app.example/api/restaurant-carte', {
 method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as never;
function fileRequest(file = new File([PDF], 'carte.pdf', { type: 'application/pdf' })) {
 const form = new FormData(); form.append('object_id', OBJECT); form.append('request_id', ID); form.append('file', file);
 jest.mocked(readBoundedFormData).mockResolvedValueOnce(form);
 return request();
}
beforeEach(() => {
 jest.clearAllMocks();
 upload.mockResolvedValue({ error: null }); copy.mockResolvedValue({ error: null });
 download.mockResolvedValue({ data: new Blob([PDF], { type: 'application/pdf' }), error: null });
 sign.mockResolvedValue({ data: { signedUrl: 'https://private.example/signed' }, error: null });
 storageFrom.mockReturnValue({ upload, copy, download, remove, createSignedUrl: sign, getPublicUrl: () => ({ data: { publicUrl: PUBLIC_URL } }) });
 jest.mocked(authenticated).mockResolvedValue({ ok: true, jwt: 'caller-jwt', userId: ID,
  server: { storage: { from: storageFrom }, schema: () => ({ rpc: serviceRpc }) } } as never);
 jest.mocked(callerClient).mockReturnValue({ schema: () => ({ rpc }) } as never);
 rpc.mockImplementation(async (name) => {
  if (name === 'read_restaurant_cartes') return { data: [], error: null };
  if (name === 'prepare_restaurant_carte_upload') return { data: receipt('reserved'), error: null };
  if (name === 'get_restaurant_carte_upload') return { data: receipt('staged'), error: null };
  if (name === 'prepare_restaurant_carte_mutation') return { data: { state: 'prepared', upload: receipt() }, error: null };
  if (name === 'finalize_restaurant_carte_mutation') return { data: result(), error: null };
  return { data: { state: 'prepared', result: null }, error: null };
 });
 serviceRpc.mockImplementation(async(name) => ({ data: receipt(name === 'record_restaurant_carte_staged' ? 'staged' : 'copied'), error: null }));
 jest.mocked(processImage).mockResolvedValue({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0]), mimeType: 'image/jpeg', width: 1, height: 1 } as never);
});
test('all private entry points stop before Storage and RPC when unauthenticated', async () => {
 jest.mocked(authenticated).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
 for (const handler of [uploadCarte, mutateCarte, previewCarte, operationStatus, listCartes]) {
  expect((await handler(request())).status).toBe(401);
 }
 expect(rpc).not.toHaveBeenCalled(); expect(storageFrom).not.toHaveBeenCalled();
});
test('another object is refused before file bytes, image processing or privileged storage', async () => {
 rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
 const file = new File([PDF], 'carte.pdf', { type: 'application/pdf' }), bytes = jest.spyOn(file, 'arrayBuffer');
 expect((await uploadCarte(fileRequest(file))).status).toBe(403);
 expect(bytes).not.toHaveBeenCalled(); expect(processImage).not.toHaveBeenCalled(); expect(storageFrom).not.toHaveBeenCalled();
});
test('PDF signature and declared size are checked before staging', async () => {
 expect((await uploadCarte(fileRequest(new File(['not a pdf'], 'fake.pdf', { type: 'application/pdf' })))).status).toBe(415);
 const file = new File([PDF], 'large.pdf', { type: 'application/pdf' });
 Object.defineProperty(file, 'size', { value: MAX_CARTE_BYTES + 1 });
 expect((await uploadCarte(fileRequest(file))).status).toBe(413);
 expect(upload).not.toHaveBeenCalled(); expect(serviceRpc).not.toHaveBeenCalled();
});
test('upload stores only private bytes, records a durable receipt and never copies publicly', async () => {
 const response = await uploadCarte(fileRequest());
 expect(response.status).toBe(201);
 expect(storageFrom).toHaveBeenCalledWith('restaurant-cartes-private');
 expect(upload).toHaveBeenCalledWith('restaurant-cartes/' + OBJECT + '/' + ID + '.pdf', PDF,
  expect.objectContaining({ contentType: 'application/pdf', upsert: false }));
 expect(serviceRpc).toHaveBeenCalledWith('record_restaurant_carte_staged', { p_upload_id: ID, p_sha256: digest(PDF) });
 expect(copy).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
});
test('a lost upload receipt is recovered without deleting or overwriting bytes', async () => {
 serviceRpc.mockResolvedValue({ data: null, error: { message: 'lost response' } });
 expect((await uploadCarte(fileRequest())).status).toBe(201);
 expect(rpc).toHaveBeenCalledWith('get_restaurant_carte_upload', { p_upload_id: ID });
 expect(remove).not.toHaveBeenCalled();
});
test('forbidden publication performs no copy', async () => {
 rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
 expect((await mutateCarte(request(payload()))).status).toBe(403);
 expect(copy).not.toHaveBeenCalled(); expect(download).not.toHaveBeenCalled();
});
test('publication verifies private/public bytes, records copy, then finalizes as the caller', async () => {
 const response = await mutateCarte(request(payload()));
 expect(response.status).toBe(200);
 expect(copy).toHaveBeenCalledWith('restaurant-cartes/' + OBJECT + '/' + ID + '.pdf',
  OBJECT + '/cartes/' + ID + '.pdf', { destinationBucket: 'documents' });
 expect(serviceRpc).toHaveBeenCalledWith('record_restaurant_carte_copied',
  { p_upload_id: ID, p_sha256: digest(PDF), p_public_url: PUBLIC_URL });
 expect(rpc).toHaveBeenLastCalledWith('finalize_restaurant_carte_mutation', { p_request_id: MUTATION });
 expect(callerClient).toHaveBeenCalledWith('caller-jwt'); expect(remove).not.toHaveBeenCalled();
});
test('a different immutable destination is never trusted or overwritten', async () => {
 download.mockResolvedValueOnce({ data: new Blob([PDF]), error: null })
  .mockResolvedValueOnce({ data: new Blob([Buffer.from('x'.repeat(PDF.length))]), error: null });
 expect((await mutateCarte(request(payload()))).status).toBe(409);
 expect(serviceRpc).not.toHaveBeenCalled();
 expect(rpc.mock.calls.some(([name]) => name === 'finalize_restaurant_carte_mutation')).toBe(false);
 expect(remove).not.toHaveBeenCalled();
});
test('a real CAS conflict preserves the file and reports the request ID', async () => {
 rpc.mockImplementation(async(name) => {
  if(name === 'prepare_restaurant_carte_mutation') return { data: { state: 'prepared', upload: receipt('copied') }, error: null };
  if(name === 'finalize_restaurant_carte_mutation') return { data: null, error: { code: 'PT409' } };
  return { data: { state: 'prepared', result: null }, error: null };
 });
 const response = await mutateCarte(request(payload()));
 expect(response.status).toBe(409); expect((await response.json()).requestId).toBe(MUTATION);
 expect(copy).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
});
test('response lost after commit returns the durable result and replay makes no second copy', async () => {
 let replay = false;
 rpc.mockImplementation(async(name) => {
  if(name === 'prepare_restaurant_carte_mutation') return { data: replay ? {state:'committed',result:result()} : {state:'prepared',upload:receipt()}, error:null };
  if(name === 'finalize_restaurant_carte_mutation') return {data:null,error:{message:'lost response'}};
  return {data:{state:'committed',result:result()},error:null};
 });
 expect((await mutateCarte(request(payload()))).status).toBe(200);
 replay = true;
 expect((await mutateCarte(request(payload()))).status).toBe(200);
 expect(copy).toHaveBeenCalledTimes(1); expect(remove).not.toHaveBeenCalled();
});
test('private preview signs only its owned staged receipt; forged bucket/path is rejected', async () => {
 expect((await previewCarte(request({ uploadId: ID }))).status).toBe(200);
 expect(sign).toHaveBeenCalledWith('restaurant-cartes/' + OBJECT + '/' + ID + '.pdf', 120);
 sign.mockClear();
 rpc.mockResolvedValue({data:{...receipt(),stagingBucket:'media'},error:null});
 expect((await previewCarte(request({ uploadId: ID }))).status).toBe(503);
 expect(sign).not.toHaveBeenCalled();
});
test('metadata and removal do not require any storage copy', async () => {
 rpc.mockImplementation(async(name) => name==='prepare_restaurant_carte_mutation'
  ? {data:{state:'prepared',upload:null},error:null} : {data:result(),error:null});
 for(const action of ['metadata','remove']){
  expect((await mutateCarte(request({ objectId:OBJECT,requestId:MUTATION,payload:{
   write_contract:'restaurant-carte-v1',action,document_id:DOC,expected:{document_id:DOC},
  }}))).status).toBe(200);
 }
 expect(storageFrom).not.toHaveBeenCalled();
});
