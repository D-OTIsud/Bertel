// Native dependency/runtime smoke. Optional argument: packaged runtime root (.next/standalone or /app).
// The explicit runtime mode loads only the built route and packaged dependencies; no source/TypeScript fallback.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),runtimeRoot=path.resolve(process.argv[2]||root);
const compiledMode=Boolean(process.argv[2]);
if(!fs.existsSync(path.join(runtimeRoot,'package.json')))throw Error('Runtime package root required');
process.chdir(runtimeRoot);
const requireFrom=require('node:module').createRequire(path.join(runtimeRoot,'package.json'));
const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'bertel-menu-native-'));
function fileImport(name){return pathToFileURL(requireFrom.resolve(name)).href;}
if(compiledMode){
 // Refuse accidental fallback into the developer checkout. CI passes the real
 // standalone package root (normally .next/standalone with regular node_modules).
 for(const name of ['pdfjs-dist/package.json','pdfjs-dist/legacy/build/pdf.mjs','sharp','@napi-rs/canvas']){
  const resolved=fs.realpathSync(requireFrom.resolve(name)),relative=path.relative(runtimeRoot,resolved);
  assert(relative&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'Dependency escaped packaged runtime: '+name);
 }
}
if(!compiledMode){
 const ts=require(path.join(root,'node_modules/typescript'));
 function compile(source,name,replacements){
  let code=ts.transpileModule(fs.readFileSync(path.join(root,source),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  for(const [from,to]of replacements)code=code.split(from).join(to);
  fs.writeFileSync(path.join(dir,name),code);
 }
 compile('src/app/api/media/upload/process-image.ts','process-image.mjs',[["'sharp'","'"+fileImport('sharp')+"'"]]);
 compile('src/app/api/menu/extract/media-prep.ts','media-prep.mjs',[["'../../media/upload/process-image'","'./process-image.mjs'"]]);
 compile('src/lib/menu-document-pages.server.ts','menu-document-pages.mjs',[
  ["'../app/api/menu/extract/media-prep'","'./media-prep.mjs'"],
  ["'pdfjs-dist/legacy/build/pdf.mjs'","'"+fileImport('pdfjs-dist/legacy/build/pdf.mjs')+"'"]
 ]);
}
function fixturePdf(pageCount=1){
 const stream='BT /F1 16 Tf 30 140 Td (Carte du Longanis) Tj ET';
 const objects=[
 '<< /Type /Catalog /Pages 2 0 R >>',
 '<< /Type /Pages /Kids ['+Array.from({length:pageCount},(_,i)=>(4+i*2)+' 0 R').join(' ')+'] /Count '+pageCount+' >>',
 '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
 ];
 for(let i=0;i<pageCount;i++)objects.push(
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(5+i*2)+' 0 R >>',
 '<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream');
 let text='%PDF-1.4\n',offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(text));text+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
 const xref=Buffer.byteLength(text);
 text+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
 text+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
 return Buffer.from(text);
}
(async()=>{
 let mod,compiled=false;
 if(compiledMode){
  const bundle=path.join(runtimeRoot,'.next/server/app/api/portal-menu/extract/route.js');
  assert(fs.existsSync(bundle),'Compiled standalone extraction route missing');
  // Load the actual webpack output, including its Node resolver transformation.
  // Registering this route calls neither an HTTP handler nor an AI provider.
  await requireFrom(bundle);
  const webpack=requireFrom(path.join(runtimeRoot,'.next/server/webpack-runtime.js'));
  const entry=Object.entries(webpack.m).find(([,factory])=>String(factory).includes('standardFontDataUrl'));
  assert(entry,'Compiled PDF helper missing');
  const exports=await webpack(entry[0]);
  const inspect=Object.values(exports).find(value=>typeof value==='function'&&String(value).includes('too_many_pages'));
  const render=Object.values(exports).find(value=>typeof value==='function'&&String(value).includes('canvasFactory'));
  assert(inspect&&render,'Compiled helper exports missing');
  mod={inspectMenuDocument:inspect,renderMenuDocument:render};compiled=true;
 }else mod=await import(pathToFileURL(path.join(dir,'menu-document-pages.mjs')).href);
 const pdf=fixturePdf(),inspection=await mod.inspectMenuDocument(pdf);
 assert.equal(inspection.pageCount,1);assert.deepEqual(inspection.selectedPages,[1]);
 const images=await mod.renderMenuDocument(pdf,inspection);
 assert.equal(images.length,1);assert.equal(images[0].mime,'image/jpeg');
 const sharp=requireFrom('sharp'),metadata=await sharp(Buffer.from(images[0].base64,'base64')).metadata();
 assert.equal(metadata.format,'jpeg'); const raster=Buffer.from(images[0].base64,'base64'); const stats=await sharp(raster).stats(); assert(stats.channels[0].min<128,'PDF text was not rasterized'); fs.writeFileSync(path.join(dir,'pdf-native-page.jpg'),raster);assert(metadata.width>0&&metadata.width<=2000);assert(metadata.height>0&&metadata.height<=2000);
 await assert.rejects(()=>mod.inspectMenuDocument(pdf,[2]),e=>e.code==='invalid_pages');
 await assert.rejects(()=>mod.inspectMenuDocument(Buffer.from('not image')),e=>e.code==='mime');
 await assert.rejects(()=>mod.inspectMenuDocument(Buffer.from('%PDF-1.4 invalid PDF')),e=>e.code==='decode');
 const long=fixturePdf(9);
 await assert.rejects(()=>mod.inspectMenuDocument(long),e=>e.code==='select_pages'&&e.pageCount===9);
 const chosen=await mod.inspectMenuDocument(long,[2,9]);assert.deepEqual(chosen.selectedPages,[2,9]);
 assert.equal((await mod.renderMenuDocument(long,chosen)).length,2);
 const ctrl=new AbortController();ctrl.abort();
 await assert.rejects(()=>mod.renderMenuDocument(pdf,inspection,ctrl.signal),e=>e.code==='aborted');
 const result={date:'2026-11-03',scope:'Actual runtime PDF.js Node canvas and Sharp, including fonts/worker; local synthetic PDF only; no provider call',runtimeRoot,compiled,pageCount:inspection.pageCount,renderedPages:images.length,explicitLongSelection:[2,9],format:metadata.format,width:metadata.width,height:metadata.height,checks:9,passed:true};
 fs.writeFileSync(path.join(dir,'verification-pdf-native.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
