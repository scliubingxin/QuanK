import {startLiveOfficeKit} from '../helpers/office-live-ui.mjs';
// [lane:ribbon] Live check of whitelisted UNO commands against a real LibreOfficeKit.
// Run: WB_TEST_OFFICE_DIRECTORY=<LibreOffice program dir> node --test tests/acceptance/office-ribbon-live.mjs
import {officeDirectory,officePython} from '../helpers/office-kit-runtime.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import path from 'node:path';import {tmpdir} from 'node:os';
import {deflateSync} from 'node:zlib';import {Store} from '../../core.mjs';import {generateDocument} from '../../runtime/documents.mjs';import {createDocumentService} from '../../services/documents.mjs';import {createOfficeWorkspace} from '../../services/office-workspace.mjs';
const crc=b=>{let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}let r=0xffffffff;for(const x of b)r=t[(r^x)&255]^(r>>>8);return (r^0xffffffff)>>>0;};
const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]),c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c]);};
const png=()=>{const h=Buffer.alloc(13);h.writeUInt32BE(8,0);h.writeUInt32BE(8,4);h[8]=8;h[9]=2;const raw=Buffer.concat(Array.from({length:8},()=>Buffer.concat([Buffer.from([0]),Buffer.alloc(24,0x80)])));return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',h),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);};
test('real PPTX: uno table, page size, image, text attributes, group and state callback',{timeout:120000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-ribbon-live-')),store=new Store(dir);await store.load();const documents=createDocumentService({store}),d=(await documents.importFile('R','pptx',(await generateDocument('pptx',JSON.stringify({slides:[{title:'Hello',bullets:['Body']}]}))).bytes)).document,kit=createOfficeWorkspace({documents,directory:path.join(dir,'kit'),runtime:async()=>({python:officePython,officeDirectory}),approve:async()=>true,driver:o=>startLiveOfficeKit({...o,timeoutMs:120000})});
 const inspect=code=>{const rev=documents.read(d.id).revision,f=path.join(dir,'r'+rev+'.pptx');return writeFile(f,documents.bytes(d.id,rev).bytes).then(()=>execFileSync(officePython,['-c','from pptx import Presentation\nimport sys,json\np=Presentation(sys.argv[1])\n'+code,f]).toString());};
 try{const s=await kit.open(d.id,1),id=s.sessionId;
  let shot=await kit.snapshot(id);assert.equal(typeof shot.states,'object');
  await kit.operation(id,'uno',{command:'.uno:InsertTable',args:{Columns:3,Rows:2}});
  assert.equal((await inspect("print(sum(1 for s in p.slides[0].shapes if s.has_table))")).trim(),'1');
  await kit.operation(id,'uno',{command:'.uno:AttributePageSize',args:{'AttributePageSize.Width':28000,'AttributePageSize.Height':21000}});
  const [w,h]=(await inspect("print(p.slide_width,p.slide_height)")).trim().split(' ').map(Number);assert.ok(Math.abs(w/h-4/3)<0.01,w+'x'+h);
  await kit.insertImage(id,{name:'a.png',bytes:png()});
  assert.equal((await inspect("print(sum(1 for s in p.slides[0].shapes if s.shape_type==13))")).trim(),'1');
  // Select all drawing objects, then apply native text attributes; STATE_CHANGED must report them back.
  await kit.operation(id,'command',{command:'.uno:SelectAll'});await kit.operation(id,'command',{command:'.uno:Bold'});
  await kit.operation(id,'uno',{command:'.uno:Strikeout'});await kit.operation(id,'uno',{command:'.uno:FontHeight',args:{'FontHeight.Height':30}});
  shot=await kit.snapshot(id);
  assert.equal(shot.states['.uno:Bold'],'true');assert.equal(shot.states['.uno:Strikeout'],'true');assert.equal(shot.states['.uno:FontHeight'],'30');assert.equal(shot.states['.uno:BringToFront'],'enabled');
  assert.match(await inspect("print([(r.text,r.font.bold,r.font.size.pt if r.font.size else None) for sh in p.slides[0].shapes if sh.has_text_frame for pa in sh.text_frame.paragraphs for r in pa.runs][0])"),/'Hello', True, 30/);
  await kit.operation(id,'uno',{command:'.uno:FormatGroup'});
  assert.match(await inspect("print(sum(1 for s in p.slides[0].shapes if s.shape_type==6))"),/1/);
  await kit.operation(id,'command',{command:'.uno:Undo'});
 }finally{await kit.shutdown();await rm(dir,{recursive:true,force:true});}
});
