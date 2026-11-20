import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {mkdtemp,mkdir,rm,readdir,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {tmpdir} from 'node:os';import path from 'node:path';
import {previewOcrSource,createOcrPreviewLimiter} from '../services/ocr-source-preview.mjs';import {recognizePdf} from '../runtime/pdf-ocr.mjs';import {readDocumentSource} from '../main/document-files.mjs';
test('OCR source preview rejects concurrent requests and releases slot after success or failure',async()=>{
 let release,calls=0;const limiter=createOcrPreviewLimiter(async value=>{calls++;if(value==='wait')return await new Promise(resolve=>{release=resolve});if(value==='error')throw Error('render failed');return value;});
 const first=limiter('wait');await assert.rejects(limiter('repeated'),/正在处理/);assert.equal(calls,1);
 release('done');assert.equal(await first,'done');await assert.rejects(limiter('error'),/render failed/);
 assert.equal(await limiter('next'),'next');assert.equal(calls,3);
});
const base='/opt/codex/runtimes/codex-primary-runtime/dependencies/bin/override/',tool={executable:'/usr/bin/tesseract',pdfinfo:base+'pdfinfo',pdftoppm:base+'pdftoppm'};const pdf=execFileSync('python3',['-c',`from reportlab.pdfgen import canvas\nimport io,sys\no=io.BytesIO();c=canvas.Canvas(o,pagesize=(600,300));c.setFont('Helvetica',36);c.drawString(50,160,'EVIDENCE 12345');c.showPage();c.save();sys.stdout.buffer.write(o.getvalue())`]);const hash=createHash('sha256').update(pdf).digest('hex');
async function fixture(fn){const dir=await mkdtemp(path.join(tmpdir(),'wb-ocr-preview-test-')),runtime=path.join(dir,'runtime'),file=path.join(dir,'source.pdf');await mkdir(runtime);await writeFile(file,pdf);try{const scan=await recognizePdf({source:{folderId:'f',name:'source.pdf',sha256:hash,bytes:pdf},tools:tool,directory:runtime,startPage:1,endPage:1});const b=scan.pages[0].boxes[0],c=scan.pages[0].coordinateSpace;assert.ok(b);const entry={ocrSource:{name:'source.pdf',sha256:hash,renderer:'poppler-v1',pages:[1],regions:[{page:1,x:b.x,y:b.y,w:b.w,h:b.h,width:c.width,height:c.height,rasterSha256:c.rasterSha256}]}};const store={data:{chats:[{id:'c',knowledgeEvidence:[{runId:'r',time:1,matches:[entry]}]}]}},reference={chatId:'c',row:0,match:0,runId:'r',time:1,expectedHash:hash};let opts={store,reference,choose:async()=>file,read:f=>readDocumentSource(f,{noFollow:true,maxBytes:16*1024*1024}),tools:async()=>tool,directory:runtime,readImage:f=>readDocumentSource(f,{noFollow:true})};await fn({opts,store,entry,runtime,file,dir});}finally{await rm(dir,{recursive:true,force:true});}}
test('real OCR geometry overlays matching real PDF rendering; private temporary directory is removed',{timeout:30000},()=>fixture(async({opts,runtime,entry})=>{const r=await previewOcrSource(opts);assert.equal(r.pages.length,1);const page=r.pages[0];assert.equal(page.page,1);assert.equal(page.width,entry.ocrSource.regions[0].width);assert.equal(page.height,entry.ocrSource.regions[0].height);assert.deepEqual(page.boxes[0],(({x,y,w,h})=>({x,y,w,h}))(entry.ocrSource.regions[0]));assert.equal(Buffer.from(page.base64,'base64').subarray(1,4).toString(),'PNG');assert.deepEqual(await readdir(runtime),[]);}));
test('one native selection gates real PDF preview and does not queue a second selection',{timeout:30000},()=>fixture(async({opts,file,runtime})=>{
 let release,choices=0;opts.choose=()=>{choices++;return new Promise(resolve=>{release=resolve})};
 const preview=createOcrPreviewLimiter(),first=preview(opts);await assert.rejects(preview(opts),/正在处理/);assert.equal(choices,1);
 release(file);assert.equal((await first).pages.length,1);assert.deepEqual(await readdir(runtime),[]);
}));
test('wrong source, stale evidence, wrong geometry and rendering failure return no image and clean up',{timeout:30000},()=>fixture(async({opts,store,entry,runtime})=>{opts.choose=async()=>null;assert.equal(await previewOcrSource(opts),false);opts.choose=async()=>'/x.pdf';opts.read=async()=>Buffer.from('%PDF-wrong');await assert.rejects(previewOcrSource(opts),/不一致/);opts.read=async()=>pdf;entry.ocrSource.regions[0].width--;await assert.rejects(previewOcrSource(opts),/尺寸/);assert.deepEqual(await readdir(runtime),[]);entry.ocrSource.regions[0].width++;opts.run=async()=>{store.data.chats[0].knowledgeEvidence=[];return {status:'failed'}};await assert.rejects(previewOcrSource(opts),/不存在|变化/);assert.deepEqual(await readdir(runtime),[]);}));
test('changing the selected file during rendering discards the image and cleans temporary files',{timeout:30000},()=>fixture(async({opts,file,runtime})=>{const {runCommand}=await import('../runtime/command.mjs');opts.run=async(...args)=>{const result=await runCommand(...args);await writeFile(file,Buffer.from('%PDF-changed'));return result;};await assert.rejects(previewOcrSource(opts),/已变化/);assert.deepEqual(await readdir(runtime),[]);}));
test('abort during native selection prevents the PDF renderer from starting',{timeout:30000},()=>fixture(async({opts,file,runtime})=>{
 const ctrl=new AbortController();let launched=0;opts.signal=ctrl.signal;opts.choose=async()=>{ctrl.abort(Error('app exiting'));return file};opts.run=async()=>{launched++;return {status:'succeeded'}};
 await assert.rejects(previewOcrSource(opts),/app exiting/);assert.equal(launched,0);assert.deepEqual(await readdir(runtime),[]);
}));
test('abort terminates a real preview child and removes private PDF staging',{timeout:30000},()=>fixture(async({opts,runtime})=>{
 const {runCommand}=await import('../runtime/command.mjs'),ctrl=new AbortController();let launched=false;opts.signal=ctrl.signal;
 opts.run=(_spec,options)=>{launched=true;const result=runCommand({executable:process.execPath,args:['-e','setTimeout(()=>{},10000)'],cwd:runtime,timeoutMs:5000},options);setTimeout(()=>ctrl.abort(Error('app exiting')),60);return result};
 await assert.rejects(previewOcrSource(opts),/app exiting/);assert.equal(launched,true);assert.deepEqual(await readdir(runtime),[]);
}));
test('renders all evidence pages from a real two-page PDF and rejects a later bad page without partial output',{timeout:60000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-multipage-'));const runtime=path.join(dir,'runtime'),file=path.join(dir,'two.pdf');await mkdir(runtime);
 const data=execFileSync('python3',['-c',`from reportlab.pdfgen import canvas\nimport io,sys\no=io.BytesIO();c=canvas.Canvas(o,pagesize=(600,300));c.setFont('Helvetica',36);c.drawString(50,160,'FIRST PAGE 123');c.showPage();c.setPageSize((300,600));c.setFont('Helvetica',30);c.drawString(40,400,'SECOND PAGE 456');c.showPage();c.save();sys.stdout.buffer.write(o.getvalue())`]);await writeFile(file,data);
 try{const sha256=createHash('sha256').update(data).digest('hex');const scan=await recognizePdf({source:{folderId:'f',name:'two.pdf',sha256,bytes:data},tools:tool,directory:runtime,startPage:1,endPage:2});const regions=scan.pages.map(p=>{const b=p.boxes[0],c=p.coordinateSpace;assert.ok(b);return {page:p.page,x:b.x,y:b.y,w:b.w,h:b.h,width:c.width,height:c.height,rasterSha256:c.rasterSha256};});const source={name:'two.pdf',sha256,renderer:'poppler-v1',pages:[1,2],regions,regionsTruncated:true};const store={data:{chats:[{id:'c',knowledgeEvidence:[{runId:'r',time:1,matches:[{ocrSource:source}]}]}]}};const reference={chatId:'c',row:0,match:0,runId:'r',time:1,expectedHash:sha256};const opts={store,reference,choose:async()=>file,read:f=>readDocumentSource(f,{noFollow:true,maxBytes:16*1024*1024}),tools:async()=>tool,directory:runtime,readImage:f=>readDocumentSource(f,{noFollow:true})};const result=await previewOcrSource(opts);assert.deepEqual(result.pages.map(p=>p.page),[1,2]);assert.equal(result.regionsTruncated,true);assert.notEqual(result.pages[0].width,result.pages[1].width);source.regions[1].width--;await assert.rejects(previewOcrSource(opts),/尺寸/);assert.deepEqual(await readdir(runtime),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('PDFium-tagged evidence uses the fixed renderer route and never silently falls back',{timeout:30000},()=>fixture(async({opts,entry,runtime})=>{
 const {runCommand}=await import('../runtime/command.mjs');let materialized=0,rendered=0;
 entry.ocrSource.renderer='pdfium-wasm-v1';opts.tools=async()=>tool;
 // The injected adapter uses the real Poppler fixture bytes to exercise
 // routing and geometry; it is not a real PDFium integration test.
 opts.rasterMaterialize=async()=>{materialized++;return '/fixed/render.cjs'};
 opts.rasterRun=async({pdf,page,output,directory,signal})=>{rendered++;assert.equal(page,1);const prefix=output.slice(0,-4);const r=await runCommand({executable:tool.pdftoppm,args:['-f','1','-l','1','-singlefile','-scale-to','1600','-png',pdf,prefix],cwd:directory,timeoutMs:30000},{signal,maxBytes:65536});assert.equal(r.status,'succeeded')};
 const out=await previewOcrSource(opts);assert.equal(out.pages.length,1);assert.equal(materialized,1);assert.equal(rendered,1);assert.deepEqual(await readdir(runtime),[]);
 opts.rasterMaterialize=async()=>{throw Error('fixed assets unavailable')};await assert.rejects(previewOcrSource(opts),/fixed assets unavailable/);assert.equal(rendered,1);assert.deepEqual(await readdir(runtime),[]);
}));

test('Poppler-tagged and untagged legacy evidence cannot switch to PDFium',{timeout:30000},()=>fixture(async({opts,entry,runtime})=>{
 let rasterCalls=0;opts.tools=async()=>({pdfRasterWasm:true});opts.rasterMaterialize=async()=>{rasterCalls++;return '/fixed/render.cjs'};
 entry.ocrSource.renderer='poppler-v1';await assert.rejects(previewOcrSource(opts),/渲染工具不可用/);entry.ocrSource.renderer=undefined;await assert.rejects(previewOcrSource(opts),/未记录渲染器/);
 assert.equal(rasterCalls,0);assert.deepEqual(await readdir(runtime),[]);
}));

test('changing evidence during PDFium materialization prevents rendering and cleans staging',{timeout:30000},()=>fixture(async({opts,entry,store,runtime})=>{
 let calls=0;entry.ocrSource.renderer='pdfium-wasm-v1';opts.rasterMaterialize=async()=>{store.data.chats[0].knowledgeEvidence=[];return '/fixed/render.cjs'};opts.rasterRun=async()=>{calls++};
 await assert.rejects(previewOcrSource(opts),/不存在|变化/);assert.equal(calls,0);assert.deepEqual(await readdir(runtime),[]);
}));

test('same-size changed page image fails the OCR raster digest before any overlay',{timeout:30000},()=>fixture(async({opts,runtime})=>{
 const original=opts.readImage;opts.readImage=async f=>{const bytes=Buffer.from(await original(f));bytes[bytes.length-1]^=1;return bytes};
 await assert.rejects(previewOcrSource(opts),/渲染结果与OCR记录不一致/);assert.deepEqual(await readdir(runtime),[]);
}));

test('real Poppler OCR propagates renderer identity through saved knowledge evidence to preview',{timeout:30000},()=>fixture(async({opts,store,file,runtime})=>{
 const {makeOcrDocument}=await import('../runtime/ocr-provenance.mjs');
 const {searchKnowledge}=await import('../runtime/knowledge-search.mjs');
 const {recordKnowledgeEvidence}=await import('../services/knowledge-evidence.mjs');
 const scan=await recognizePdf({source:{folderId:'f',name:'source.pdf',sha256:hash,bytes:pdf},tools:tool,directory:runtime,startPage:1,endPage:1});
 assert.equal(scan.source.renderer,'poppler-v1');
 const made=makeOcrDocument(scan.source,scan.pages),doc={id:'doc',name:'OCR',revision:1,format:'md',text:made.text,sha256:createHash('sha256').update(made.text).digest('hex'),ocrProvenance:made.provenance};
 const word=scan.pages[0].boxes[0].text;assert.ok(word);
 const match=searchKnowledge([doc],word),chat={id:'c'};assert.ok(match.matches.length);recordKnowledgeEvidence(chat,'r',match,[doc],1);
 assert.equal(chat.knowledgeEvidence[0].matches[0].ocrSource.renderer,'poppler-v1');
 store.data.chats=[chat];opts.choose=async()=>file;
 const result=await previewOcrSource(opts);assert.equal(result.pages.length,1);assert.ok(result.pages[0].boxes.length);assert.deepEqual(await readdir(runtime),[]);
}));

test('cancel during stalled native selection or discovery releases preview and discards late result',{timeout:30000},()=>fixture(async({opts,file,runtime})=>{
 for(const stage of ['choose','read','tools']){
  const c=new AbortController();let release,entered=false,launched=0;const wait=new Promise(r=>{release=r});
  const adjusted={...opts,signal:c.signal,run:async()=>{launched++;throw Error('must not render')}};
  adjusted[stage]=()=>{entered=true;return wait};
  const limited=createOcrPreviewLimiter(),pending=limited(adjusted);
  while(!entered)await new Promise(r=>setImmediate(r));
  c.abort(Error('preview cancelled'));await assert.rejects(pending,/preview cancelled/);
  release(stage==='choose'?file:stage==='read'?pdf:tool);await new Promise(r=>setImmediate(r));
  assert.equal(launched,0);assert.deepEqual(await readdir(runtime),[]);
  assert.equal(await limited({...opts,choose:async()=>null}),false);
 }
}));

test('cancel while staged page image read stalls removes temporary PDF and discards late bytes',{timeout:30000},()=>fixture(async({opts,runtime})=>{
 const c=new AbortController();let entered=false,release;const wait=new Promise(r=>{release=r});
 const pending=previewOcrSource({...opts,signal:c.signal,readImage:()=>{entered=true;return wait}});
 while(!entered)await new Promise(r=>setImmediate(r));c.abort(Error('page read cancelled'));
 await assert.rejects(pending,/page read cancelled/);assert.deepEqual(await readdir(runtime),[]);
 release(Buffer.from('late'));await new Promise(r=>setImmediate(r));assert.deepEqual(await readdir(runtime),[]);
}));
