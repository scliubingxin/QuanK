import {test} from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {tmpdir} from 'node:os';import {mkdtemp,rm,readFile,copyFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {Store} from '../core.mjs';import {generateDocument} from '../runtime/documents.mjs';import {createDocumentService} from '../services/documents.mjs';import {createOfficeWorkspace} from '../services/office-workspace.mjs';
async function setup(requests){const dir=await mkdtemp(path.join(tmpdir(),'wb-uno-')),store=new Store(dir);await store.load();const documents=createDocumentService({store}),d=(await documents.importFile('Uno','docx',(await generateDocument('docx',JSON.stringify({blocks:[{type:'paragraph',text:'hello'}]}))).bytes)).document;
 const kit=createOfficeWorkspace({documents,directory:path.join(dir,'kit'),runtime:async()=>({python:'x',officeDirectory:'y'}),approve:async()=>true,driver:async(o)=>({request:async(op,data)=>{requests.push([op,data]);if(op==='save')await copyFile(path.join(o.directory,'document.'+o.format),path.join(o.directory,'edited.'+o.format));return {};},close(){}})});return {dir,kit,d};}
test('uno operation validates in the host and forwards only typed arguments',async()=>{
 const rq=[],f=await setup(rq);try{const s=await f.kit.open(f.d.id,1),id=s.sessionId;
  await f.kit.operation(id,'uno',{command:'.uno:FontHeight',args:{'FontHeight.Height':18}});
  assert.deepEqual(rq.find(r=>r[0]==='uno'),['uno',{command:'.uno:FontHeight',args:{'FontHeight.Height':{type:'float',value:18}}}]);
  const n=rq.length;
  for(const bad of [{command:'.uno:Quit'},{command:'.uno:FontHeight',args:{'FontHeight.Height':-1}},{command:'.uno:Color',args:{Color:1,Other:2}},{command:'.uno:InsertGraphic',args:{FileName:'file:///etc/passwd'}},{command:'.uno:Bold'}])
   await assert.rejects(f.kit.operation(id,'uno',bad));
  await assert.rejects(f.kit.operation(id,'uno',{command:'.uno:AlignLeft'}),/文档类型/); // [docx] tables are now allowed in Word; spreadsheet-only commands are not
  assert.equal(rq.length,n);
 }finally{await f.kit.shutdown();await rm(f.dir,{recursive:true,force:true});}});
test('insertImage only accepts real PNG/JPEG bytes',async()=>{
 const rq=[],f=await setup(rq);try{const s=await f.kit.open(f.d.id,1);await assert.rejects(f.kit.insertImage(s.sessionId,{name:'a.png',bytes:new Uint8Array([1])}),/PNG或JPEG/);}finally{await f.kit.shutdown();await rm(f.dir,{recursive:true,force:true});}});
test('preload exposes pickImage but no raw UNO channel; worker enforces its own checks',async()=>{
 const pre=await readFile(new URL('../office-preload.cjs',import.meta.url),'utf8');assert.match(pre,/'pickImage'/);assert.doesNotMatch(pre,/'uno'/);
 const worker=await readFile(new URL('../runtime/office-kit/worker.py',import.meta.url),'utf8');assert.match(worker,/Image must come from the controlled upload directory/);assert.match(worker,/kind==8 and payload/);});
