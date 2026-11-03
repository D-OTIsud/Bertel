import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Real HTTP Storage proof, with no remote/production mode and no .env loading.
// Usage: node tools/partner-api/test-carte-storage.mjs <supabase-local-status.json>
const statusPath=process.argv[2];
if(!statusPath)throw Error('Disposable Supabase status JSON required');
const status=JSON.parse(readFileSync(statusPath,'utf8'));
const endpoint=new URL(status.API_URL),db=new URL(status.DB_URL);
assert(endpoint.protocol==='http:'&&['127.0.0.1','localhost'].includes(endpoint.hostname)&&endpoint.port==='54321','Local API only');
assert(['postgresql:','postgres:'].includes(db.protocol)&&['127.0.0.1','localhost'].includes(db.hostname)&&db.port==='54322','Local database only');
assert(typeof status.SERVICE_ROLE_KEY==='string'&&status.SERVICE_ROLE_KEY&&typeof status.ANON_KEY==='string'&&status.ANON_KEY,'Local credentials missing');
const marker=spawnSync('psql',[status.DB_URL,'-v','ON_ERROR_STOP=1','-Atc',"SELECT purpose FROM bertel_ci_fixture.bootstrap WHERE purpose='partner-contract-local-only'"],{encoding:'utf8'});
assert(marker.status===0&&marker.stdout.trim()==='partner-contract-local-only','Disposable bootstrap marker required');
const requireUi=createRequire(fileURLToPath(new URL('../../bertel-tourism-ui/package.json',import.meta.url)));
const {createClient}=requireUi('@supabase/supabase-js');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(endpoint.href,status.SERVICE_ROLE_KEY,options),ordinary=createClient(endpoint.href,status.ANON_KEY,options);
const id=randomUUID(),object='RESRUN999999C901';
const privatePath=`restaurant-cartes/${object}/${id}.pdf`,publicPath=`${object}/cartes/${id}.pdf`;
const pdf=Buffer.from('%PDF-1.4\n% Synthetic Storage transport fixture; not a rendered document\n'+('0123456789abcdef'.repeat(512))+'\n%%EOF');
const sha=b=>createHash('sha256').update(b).digest('hex');
let userId=null,checks=0;
const publicUrl=(bucket,path)=>new URL(`/storage/v1/object/public/${bucket}/${path}`,endpoint);
const bytes=async response=>Buffer.from(await response.arrayBuffer());
async function denied(url,init={}){const response=await fetch(url,{...init,signal:AbortSignal.timeout(10000)});assert(!response.ok,'Private bytes unexpectedly accessible');assert(!((await bytes(response)).equals(pdf)),'Private bytes leaked');checks++;}
try{
 const created=await admin.auth.admin.createUser({email:`carte-storage-${id}@example.test`,password:'Disposable-'+id,email_confirm:true,app_metadata:{sandbox_discovery:true}});
 assert(!created.error&&created.data.user,'Disposable user creation failed');userId=created.data.user.id;
 const login=await ordinary.auth.signInWithPassword({email:created.data.user.email,password:'Disposable-'+id});assert(!login.error&&login.data.session,'Disposable login failed');
 const authenticatedHeaders={apikey:status.ANON_KEY,Authorization:`Bearer ${login.data.session.access_token}`};
 const bucket=await admin.storage.getBucket('restaurant-cartes-private');assert(!bucket.error&&bucket.data.public===false&&bucket.data.file_size_limit===10485760,'Private 10 MiB bucket contract missing');checks++;
 const staged=await admin.storage.from('restaurant-cartes-private').upload(privatePath,pdf,{contentType:'application/pdf',upsert:false});assert(!staged.error,'Private staging upload failed');checks++;
 await denied(publicUrl('restaurant-cartes-private',privatePath));
 await denied(publicUrl('restaurant-cartes-private',privatePath),{method:'HEAD'});
 await denied(new URL(`/storage/v1/object/authenticated/restaurant-cartes-private/${privatePath}`,endpoint),{headers:authenticatedHeaders});
 const signed=await admin.storage.from('restaurant-cartes-private').createSignedUrl(privatePath,120);assert(!signed.error&&signed.data.signedUrl,'Server-signed private preview missing');
 const preview=await fetch(signed.data.signedUrl,{signal:AbortSignal.timeout(10000)});assert.equal(preview.status,200);assert.equal(sha(await bytes(preview)),sha(pdf));checks++;
 await denied(publicUrl('documents',publicPath));
 const copied=await admin.storage.from('restaurant-cartes-private').copy(privatePath,publicPath,{destinationBucket:'documents'});assert(!copied.error,'Cross-bucket copy failed');checks++;
 const again=await admin.storage.from('restaurant-cartes-private').copy(privatePath,publicPath,{destinationBucket:'documents'});assert(again.error,'Immutable copy unexpectedly overwrote destination');checks++;
 const url=publicUrl('documents',publicPath),get=await fetch(url,{signal:AbortSignal.timeout(10000)});
 assert.equal(get.status,200);assert.equal(get.redirected,false);assert.equal(get.url,url.href);assert.match(get.headers.get('content-type')||'',/^application\/pdf/);assert.equal(sha(await bytes(get)),sha(pdf));checks++;
 const cache=get.headers.get('cache-control');assert(cache&&/\bpublic\b/i.test(cache)&&!/\b(private|no-store)\b/i.test(cache),'Public cache header missing');checks++;
 const head=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(10000)});assert.equal(head.status,200);assert.equal(head.redirected,false);assert.equal(head.url,url.href);assert.equal(head.headers.get('cache-control'),cache);assert.equal(Number(head.headers.get('content-length')),pdf.length);assert.equal((await bytes(head)).length,0);checks++;
 const range=await fetch(url,{headers:{Range:'bytes=0-15'},signal:AbortSignal.timeout(10000)});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),`bytes 0-15/${pdf.length}`);assert((await bytes(range)).equals(pdf.subarray(0,16)));checks++;
 const forgedPrivate=await ordinary.storage.from('restaurant-cartes-private').upload(privatePath,Buffer.from('replace'),{contentType:'application/pdf',upsert:true});assert(forgedPrivate.error,'Ordinary user overwrote private staging');checks++;
 const forgedPublic=await ordinary.storage.from('documents').upload(publicPath,Buffer.from('replace'),{contentType:'application/pdf',upsert:true});assert(forgedPublic.error,'Ordinary user overwrote immutable public carte');checks++;
 const privateAfter=await admin.storage.from('restaurant-cartes-private').download(privatePath);assert(!privateAfter.error&&sha(Buffer.from(await privateAfter.data.arrayBuffer()))===sha(pdf));
 const publicAfter=await fetch(url,{signal:AbortSignal.timeout(10000)});assert.equal(sha(await bytes(publicAfter)),sha(pdf));checks++;
 // A copy never broadens access to the original staging key.
 await denied(publicUrl('restaurant-cartes-private',privatePath),{headers:{Range:'bytes=0-15'}});
 console.log(JSON.stringify({scope:'Ephemeral Supabase Storage HTTP; synthetic bytes only; no product/provider call',checks,passed:true,verified:['private staging deny','authenticated deny','short-lived server preview','immutable cross-bucket copy','public GET/HEAD/Range','public cache and no redirect','ordinary overwrite denied','hash preserved'],limit:'A published Storage URL remains public after unlinking; SQL C tests separately prove projection withdrawal and preservation of the shared document. This transport test does not simulate a new document model.'}));
}finally{
 // Only the known synthetic keys/user created by this test, never a folder or production resource.
 const cleanup=await Promise.all([admin.storage.from('restaurant-cartes-private').remove([privatePath]),admin.storage.from('documents').remove([publicPath])]);
 if(userId){const removed=await admin.auth.admin.deleteUser(userId);assert(!removed.error,'Disposable auth cleanup failed');}
 assert(cleanup.every(r=>!r.error),'Disposable Storage cleanup failed');
}
