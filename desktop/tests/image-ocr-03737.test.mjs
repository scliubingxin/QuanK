import {existsSync} from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {ToolRuntime} from '../runtime/tools.mjs';import {recognizeImage,bundledOcrEngine} from '../runtime/image-ocr.mjs';
const png=execFileSync('python3',['-c',`from PIL import Image,ImageDraw,ImageFont
import io,sys
im=Image.new('RGB',(900,160),'white'); ImageDraw.Draw(im).text((30,35),'INVOICE TOTAL 12345',font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',48),fill='black');o=io.BytesIO();im.save(o,'PNG');sys.stdout.buffer.write(o.getvalue())`]);
async function fixture(fn){const dir=await mkdtemp(path.join(tmpdir(),'wb-ocr-test-'));const row={id:'img',name:'test.png',base64:png.toString('base64'),bytes:png.length,sha256:createHash('sha256').update(png).digest('hex')},store={dir,data:{imageAttachments:[row],executions:[]},save:async()=>{},log:()=>{}};let approved=true;const rt=new ToolRuntime({store,browser:{},approve:async()=>approved,ocrEngine:async()=>({executable:'/usr/bin/tesseract'})});try{await fn({rt,store,row,dir,deny:()=>approved=false});}finally{await rm(dir,{recursive:true,force:true});}}
test('actual local OCR image pipeline recognizes text and redacts audit',()=>fixture(async({rt,store,dir})=>{const result=await rt.execute('image_ocr',{imageId:'img',language:'eng'},undefined,{runId:'r',allowedImageIds:['img']});assert.equal(result.status,'succeeded',result.error);assert.match(result.text,/INVOICE TOTAL 12345/i);assert.ok(!JSON.stringify(store.data.executions).includes('INVOICE TOTAL'));assert.deepEqual(await readdir(dir),[]);}));
test('denied, not attached, source changed during approval and missing bundled runtime fail closed',()=>fixture(async({rt,store,row,deny})=>{let calls=0;rt.ocrEngine=async()=>{calls++;return {executable:'/usr/bin/tesseract'}};deny();assert.equal((await rt.execute('image_ocr',{imageId:'img'},undefined,{allowedImageIds:['img']})).status,'denied');assert.equal((await rt.execute('image_ocr',{imageId:'img'},undefined,{allowedImageIds:[]})).status,'failed');rt.approve=async()=>{store.data.imageAttachments=[];return true};assert.equal((await rt.execute('image_ocr',{imageId:'img'},undefined,{allowedImageIds:['img']})).status,'failed');assert.equal(calls,0);if(existsSync(new URL('../runtime/vendor/ocr-wasm/data/eng.traineddata',import.meta.url)))assert.equal((await bundledOcrEngine('/nonexistent')).wasm,true);else await assert.rejects(bundledOcrEngine('/nonexistent'),/未内置/);}));
test('cancelled and failed OCR clean private staging',()=>fixture(async({dir})=>{const c=new AbortController();c.abort();await assert.rejects(recognizeImage({image:{bytes:png},engine:{executable:'/usr/bin/tesseract'},directory:dir,signal:c.signal}));await assert.rejects(recognizeImage({image:{bytes:png},engine:{executable:'/usr/bin/tesseract'},directory:dir,run:async()=>({status:'failed'})}),/识别失败/);assert.deepEqual(await readdir(dir),[]);}));
test('real OCR returns bounded word pixel boxes without copying text to audit',()=>fixture(async({rt,store})=>{const r=await rt.execute('image_ocr',{imageId:'img',language:'eng'},undefined,{allowedImageIds:['img']});assert.equal(r.status,'succeeded',r.error);assert.ok(r.boxes.length>=3);assert.equal(r.coordinateSpace.width,900);assert.equal(r.coordinateSpace.height,160);assert.equal(r.coordinateSpace.origin,'top-left');for(const b of r.boxes){assert.ok(b.x>=0&&b.y>=0&&b.w>0&&b.h>0&&b.x+b.w<=900&&b.y+b.h<=160);}assert.ok(!JSON.stringify(store.data.executions).includes('INVOICE'));}));
test('OCR TSV parser rejects malformed and out-of-image coordinates and bounds box count',async()=>{const {parseOcrTsv}=await import('../runtime/image-ocr.mjs');const h='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n';const row=(x)=>`5\t1\t1\t1\t1\t1\t${x}\t0\t1\t1\t90\tX\n`;assert.throws(()=>parseOcrTsv('not-tsv',100,100));assert.throws(()=>parseOcrTsv(h+row(100),100,100),/超出/);assert.throws(()=>parseOcrTsv(h+row(''),100,100),/格式/);const p=parseOcrTsv(h+row(1).repeat(65),100,100);assert.equal(p.boxes.length,64);assert.equal(p.boxesTruncated,true);assert.equal(p.text.split(' ').length,65);});
test('image OCR cancellation while dependency discovery hangs discards late engine',{timeout:5000},()=>fixture(async({rt,store})=>{let entered=false,release;const discovery=new Promise(r=>{release=r;});rt.ocrEngine=()=>{entered=true;return discovery};const c=new AbortController(),p=rt.execute('image_ocr',{imageId:'img',language:'eng'},c.signal,{runId:'r',allowedImageIds:['img']});while(!entered)await new Promise(r=>setImmediate(r));c.abort(Error('cancel image engine'));await assert.rejects(p,/cancel image engine/);release({executable:'/usr/bin/tesseract'});await new Promise(r=>setTimeout(r,20));assert.equal(store.data.executions[0].status,'cancelled');assert.equal(store.data.documents?.length||0,0);}));

test('actual OCR output can be approved and saved once as a source-identified document',{timeout:30000},()=>fixture(async({rt,store,row})=>{
 const context={runId:'run-a',allowedImageIds:['img']};
 const scan=await rt.execute('image_ocr',{imageId:'img'},undefined,context);
 assert.equal(scan.status,'succeeded',scan.error);assert.ok(scan.receiptId);
 const foreign=await rt.execute('image_ocr_import',{receiptId:scan.receiptId,name:'识别'},undefined,{...context,runId:'run-b'});
 assert.equal(foreign.status,'failed');
 rt.approve=async()=>false;
 const denied=await rt.execute('image_ocr_import',{receiptId:scan.receiptId,name:'识别'},undefined,context);
 assert.equal(denied.status,'denied');assert.equal(store.data.documents?.length||0,0);
 rt.approve=async()=>true;
 const saved=await rt.execute('image_ocr_import',{receiptId:scan.receiptId,name:'识别'},undefined,context);
 assert.equal(saved.status,'succeeded',saved.error);assert.equal(saved.verified,true);
 assert.equal(saved.document.format,'md');assert.match(saved.document.text,/INVOICE TOTAL 12345/);
 assert.ok(saved.document.text.includes(row.sha256));assert.ok(saved.document.text.includes('test.png'));
 assert.equal((await rt.execute('image_ocr_import',{receiptId:scan.receiptId,name:'重复'},undefined,context)).status,'failed');
 assert.doesNotMatch(JSON.stringify(store.data.executions),/INVOICE TOTAL/);
}));
test('source revocation and failed persistence do not publish an OCR document',{timeout:30000},()=>fixture(async({rt,store,row})=>{
 const context={runId:'run-a',allowedImageIds:['img']};
 let scan=await rt.execute('image_ocr',{imageId:'img'},undefined,context);
 assert.equal(scan.status,'succeeded',scan.error);
 rt.approve=async(title)=>{if(title==='保存图片识别成果')store.data.imageAttachments=[];return true;};
 let result=await rt.execute('image_ocr_import',{receiptId:scan.receiptId,name:'识别'},undefined,context);
 assert.equal(result.status,'failed');assert.equal(store.data.documents?.length||0,0);
 store.data.imageAttachments=[row];rt.approve=async()=>true;
 scan=await rt.execute('image_ocr',{imageId:'img'},undefined,context);
 const original=store.save;let failedDuringCommit=false;
 store.save=async()=>{if(store.data.documents?.length&&!failedDuringCommit){failedDuringCommit=true;throw Error('disk failure')}};
 result=await rt.execute('image_ocr_import',{receiptId:scan.receiptId,name:'识别'},undefined,context);
 assert.equal(result.status,'failed');assert.equal(failedDuringCommit,true);assert.equal(store.data.documents?.length||0,0);store.save=original;
 rt.releaseGrants('run-a');
 assert.equal((await rt.execute('image_ocr_import',{receiptId:scan.receiptId,name:'失效'},undefined,context)).status,'failed');
}));
test('image OCR import is only offered when agent has OCR and document-create privileges',async()=>{
 const {createAgentSession}=await import('../services/agent-session.mjs');
 for(const [tools,expected] of [
  [['image_ocr_import'],false],
  [['image_ocr_import','image_ocr'],false],
  [['image_ocr_import','document_create'],false],
  [['image_ocr_import','image_ocr','document_create'],true],
 ]){
  const agent={id:'a',name:'test',prompt:'test',tools,knowledge:[]};
  const store={data:{agents:[agent],executions:[]},save:async()=>{},log:()=>{}};
  const session=await createAgentSession({agent,store,runId:'r',executeTool:async()=>({})});
  assert.equal(session.definitions.some(t=>t.function.name==='image_ocr_import'),expected);
  await session.close();
 }
});

test('HTTP model tool loop performs real OCR and saves the approved image document',{timeout:30000},()=>fixture(async({rt,store})=>{
 const {createServer}=await import('node:http');
 const {runAgent}=await import('../runtime/agent.mjs'),{complete}=await import('../core.mjs'),{createAgentSession}=await import('../services/agent-session.mjs');
 const agent={id:'a',name:'test',prompt:'test',tools:['image_ocr','image_ocr_import','document_create'],knowledge:[]};store.data.agents=[agent];
 let calls=0;const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const payload=JSON.parse(raw);calls++;let msg;
  if(calls===1)msg={role:'assistant',tool_calls:[{id:'read',type:'function',function:{name:'image_ocr',arguments:JSON.stringify({imageId:'img'})}}]};
  else if(calls===2){const observation=JSON.parse(payload.messages.find(m=>m.role==='tool').content);msg={role:'assistant',tool_calls:[{id:'save',type:'function',function:{name:'image_ocr_import',arguments:JSON.stringify({receiptId:observation.receiptId,name:'扫描成果'})}}]};}
  else msg={role:'assistant',content:'已保存'};
  res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:msg}]}));
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 try{
  const session=await createAgentSession({agent,store,runId:'r',executeTool:(name,args,signal,ctx)=>rt.execute(name,args,signal,{...ctx,allowedImageIds:['img']})});
  try{
   const result=await runAgent({messages:[{role:'user',content:'识别并保存图片'}],definitions:session.definitions,request:(m,t)=>complete({baseUrl:'http://127.0.0.1:'+server.address().port,model:'fixture'},'',m,undefined,t),execute:(name,args,signal)=>session.execute(name,args,signal)});
   assert.equal(calls,3);assert.equal(result.events[1].status,'succeeded');assert.equal(store.data.documents.length,1);assert.match(store.data.documents[0].text,/INVOICE TOTAL 12345/);
  }finally{await session.close();rt.releaseGrants('r');}
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}));

test('revocation during document commit rolls back image OCR result',{timeout:30000},()=>fixture(async({rt,store})=>{
 const context={runId:'run-a',allowedImageIds:['img']};
 const scan=await rt.execute('image_ocr',{imageId:'img'},undefined,context);
 assert.equal(scan.status,'succeeded',scan.error);let revoked=false;
 store.save=async()=>{if(store.data.documents?.length&&!revoked){revoked=true;rt.releaseGrants('run-a');}};
 const result=await rt.execute('image_ocr_import',{receiptId:scan.receiptId,name:'result'},undefined,context);
 assert.equal(result.status,'failed');assert.equal(revoked,true);assert.equal(store.data.documents.length,0);
}));

test('conversation records the real OCR document as a trusted run attachment',{timeout:30000},()=>fixture(async({rt,store,row})=>{
 const {initialState}=await import('../core.mjs'),{createConversationService}=await import('../services/conversation.mjs');
 store.data={...initialState(),documents:[],imageAttachments:[row]};
 const agent={id:'a',name:'test',prompt:'test',tools:['image_ocr','image_ocr_import','document_create'],knowledge:[]};store.data.agents=[agent];
 let calls=0;const service=createConversationService({store,active:new Map(),key:()=>'',view:()=>store.data,images:{selected:()=>[{...row,width:900,height:160}]},approve:async()=>true,
 executeTool:(name,args,signal,context)=>rt.execute(name,args,signal,context),releaseToolGrants:id=>rt.releaseGrants(id),
 request:async(_settings,_key,messages)=>{
  calls++;
  if(calls===1)return {message:{role:'assistant',tool_calls:[{id:'read',type:'function',function:{name:'image_ocr',arguments:JSON.stringify({imageId:'img'})}}]}};
  if(calls===2){const result=JSON.parse(messages.find(m=>m.role==='tool').content);return {message:{role:'assistant',tool_calls:[{id:'save',type:'function',function:{name:'image_ocr_import',arguments:JSON.stringify({receiptId:result.receiptId,name:'识别结果'})}}]}};}
  return {message:{role:'assistant',content:'已保存'}};
 }});
 await service.run({id:'c',requestId:'run-x',agentId:'a',prompt:'识别并保存',images:['img'],toolsEnabled:true});
 assert.equal(calls,3);assert.equal(store.data.documents.length,1);
 const chat=store.data.chats.find(c=>c.id==='c');
 assert.equal(chat.documentRefs.length,1);assert.equal(chat.documentRefs[0].id,store.data.documents[0].id);
 assert.equal(chat.documentRefs[0].runId,'run-x');assert.equal(rt.imageOcrReceipts.size,0);
 assert.doesNotMatch(JSON.stringify(store.data.executions),/INVOICE TOTAL/);
}));

test('cancel while image OCR save approval hangs prevents late approval from saving',{timeout:5000},()=>fixture(async({rt,store})=>{
 const context={runId:'run-a',allowedImageIds:['img']};
 const scan=await rt.execute('image_ocr',{imageId:'img'},undefined,context);assert.equal(scan.status,'succeeded',scan.error);
 let entered=false,release;const approval=new Promise(r=>{release=r;});
 rt.approve=()=>{entered=true;return approval;};
 const c=new AbortController(),pending=rt.execute('image_ocr_import',{receiptId:scan.receiptId,name:'result'},c.signal,context);
 while(!entered)await new Promise(r=>setImmediate(r));c.abort(Error('approval cancelled'));
 await assert.rejects(pending,/approval cancelled/);release(true);await new Promise(r=>setTimeout(r,20));
 assert.equal(store.data.documents?.length||0,0);assert.equal(store.data.executions[0].status,'cancelled');
}));

test('saved OCR document can be explicitly bound and searched with an approved document read',{timeout:30000},()=>fixture(async({rt,store})=>{
 const context={runId:'run-a',allowedImageIds:['img']};
 const scan=await rt.execute('image_ocr',{imageId:'img'},undefined,context);
 const saved=await rt.execute('image_ocr_import',{receiptId:scan.receiptId,name:'发票识别'},undefined,context);
 assert.equal(saved.status,'succeeded',saved.error);
 const {createAgentSession}=await import('../services/agent-session.mjs');
 const agent={id:'a',name:'reader',prompt:'test',tools:['document_read'],knowledge:[saved.document.id]};store.data.agents=[agent];
 const session=await createAgentSession({agent,store,runId:'next',executeTool:(name,args,signal,ctx)=>rt.execute(name,args,signal,ctx)});
 try{
  const result=await session.execute('knowledge_search',{query:'12345'});
  assert.equal(result.status,'succeeded');assert.ok(result.matches.some(m=>m.source.id===saved.document.id&&m.text.includes('12345')));
  const match=result.matches.find(m=>m.imageOcrSource?.sha256===scan.source.sha256);
  assert.ok(match);assert.ok(match.imageOcrSource.regions.length);assert.equal(match.imageOcrSource.width,900);
  const {recordKnowledgeEvidence}=await import('../services/knowledge-evidence.mjs'),{knowledgeEvidence}=await import('../src/ui/knowledge-evidence.js');
  const chat={id:'c'};recordKnowledgeEvidence(chat,'next',result,store.data.documents);
  const rendered=knowledgeEvidence(chat,'next',store.data.documents);
  assert.match(rendered,/原图片/);assert.match(rendered,/<mark class="ocr-word">/);assert.ok(rendered.includes(scan.source.sha256));
  const {previewImageOcrEvidence}=await import('../services/image-ocr-evidence-preview.mjs');store.data.chats=[chat];const m=chat.knowledgeEvidence[0].matches.findIndex(x=>x.imageOcrSource?.regions?.length);const preview=previewImageOcrEvidence({store,reference:{chatId:'c',row:0,match:m,runId:'next',time:chat.knowledgeEvidence[0].time,expectedHash:scan.source.sha256}});assert.equal(preview.width,900);assert.ok(preview.boxes.length);assert.equal(Buffer.from(preview.base64,'base64').equals(png),true);
 }finally{await session.close();rt.releaseGrants('run-a');rt.releaseGrants('next');}
}));

test('concurrent use of one image OCR receipt publishes at most one document',{timeout:5000},()=>fixture(async({rt,store})=>{
 const context={runId:'run-a',allowedImageIds:['img']};
 const scan=await rt.execute('image_ocr',{imageId:'img'},undefined,context);assert.equal(scan.status,'succeeded',scan.error);
 let entered=false,release;const hold=new Promise(r=>{release=r;});
 store.save=async()=>{if(store.data.documents?.length&&!entered){entered=true;await hold;}};
 const first=rt.execute('image_ocr_import',{receiptId:scan.receiptId,name:'one'},undefined,context);
 while(!entered)await new Promise(r=>setImmediate(r));
 const second=await rt.execute('image_ocr_import',{receiptId:scan.receiptId,name:'two'},undefined,context);
 assert.equal(second.status,'failed');release();
 const completed=await first;assert.equal(completed.status,'succeeded',completed.error);assert.equal(store.data.documents.length,1);
}));

test('image OCR keeps full text and complete tool JSON when positional boxes exceed budget',async()=>{
 const {boundImageOcrResult}=await import('../runtime/image-ocr.mjs'),{serializeToolObservation}=await import('../runtime/agent.mjs');
 const text='x'.repeat(29000),result={status:'succeeded',text,boxes:Array.from({length:64},()=>({text:'x'.repeat(500),x:0,y:0,w:1,h:1})),boxesTruncated:false,source:{name:'scan.png'}};
 boundImageOcrResult(result);result.receiptId='receipt';
 assert.equal(result.text,text);assert.equal(result.boxesTruncated,true);assert.ok(result.boxes.length<64);
 const observed=JSON.parse(serializeToolObservation(result));assert.equal(observed.receiptId,'receipt');assert.equal(observed.text,text);assert.equal(observed.truncated,undefined);
 assert.throws(()=>boundImageOcrResult({text:'\\\\'.repeat(30000),boxes:[]}),/完整返回预算/);
});

test('concurrent image OCR jobs keep their text and sources isolated',{timeout:30000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-ocr-parallel-'));
 const labels=['ALPHA 12947','BRAVO 81635','CHARLIE 37462','DELTA 55391'];
 const rows=labels.map((label,i)=>{
  const bytes=execFileSync('python3',['-c',`from PIL import Image,ImageDraw,ImageFont
import io,sys
im=Image.new('RGB',(900,160),'white');ImageDraw.Draw(im).text((30,35),sys.argv[1],font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',48),fill='black');out=io.BytesIO();im.save(out,'PNG');sys.stdout.buffer.write(out.getvalue())`,label]);
  return {id:'image-'+i,name:'image-'+i+'.png',base64:bytes.toString('base64'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 });
 const store={dir,data:{imageAttachments:rows,executions:[],documents:[]},save:async()=>{},log:()=>{}};
 const rt=new ToolRuntime({store,browser:{},approve:async()=>true,ocrEngine:async()=>({executable:'/usr/bin/tesseract'})});
 try{
  const scans=await Promise.all(rows.map((row,i)=>rt.execute('image_ocr',{imageId:row.id},undefined,{runId:'r'+i,allowedImageIds:[row.id]})));
  assert.ok(scans.every(x=>x.status==='succeeded'));
  const saved=await Promise.all(scans.map((scan,i)=>rt.execute('image_ocr_import',{receiptId:scan.receiptId,name:'result-'+i},undefined,{runId:'r'+i,allowedImageIds:[rows[i].id]})));
  for(let i=0;i<4;i++){
   assert.equal(saved[i].status,'succeeded',saved[i].error);
   assert.ok(saved[i].document.text.includes(labels[i]));
   assert.ok(saved[i].document.text.includes(rows[i].sha256));
   for(let j=0;j<4;j++)if(j!==i)assert.ok(!saved[i].document.text.includes(labels[j]));
   rt.releaseGrants('r'+i);
  }
  assert.equal(store.data.documents.length,4);assert.equal(rt.imageOcrReceipts.size,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('model cannot smuggle invented text into a saved OCR document',{timeout:30000},()=>fixture(async({rt,store})=>{
 const context={runId:'r',allowedImageIds:['img']},scan=await rt.execute('image_ocr',{imageId:'img'},undefined,context);
 const {createAgentSession}=await import('../services/agent-session.mjs'),{runAgent}=await import('../runtime/agent.mjs');
 const agent={id:'a',name:'test',prompt:'test',tools:['image_ocr','image_ocr_import','document_create'],knowledge:[]};store.data.agents=[agent];
 const session=await createAgentSession({agent,store,runId:'r',executeTool:(name,args,signal,ctx)=>rt.execute(name,args,signal,{...ctx,allowedImageIds:['img']})});
 try{
  await assert.rejects(runAgent({messages:[{role:'user',content:'save'}],definitions:session.definitions,
   request:async()=>({message:{role:'assistant',tool_calls:[{id:'x',type:'function',function:{name:'image_ocr_import',arguments:JSON.stringify({receiptId:scan.receiptId,name:'result',content:'invented'})}}]}}),
   execute:(name,args,signal)=>session.execute(name,args,signal)}),/结构约束/);
  assert.equal(store.data.documents?.length||0,0);assert.ok(rt.imageOcrReceipts.has(scan.receiptId));
 }finally{await session.close();rt.releaseGrants('r');}
}));
