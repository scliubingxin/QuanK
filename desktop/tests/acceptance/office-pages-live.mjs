// [lane:pages] Live check against the real LibreOfficeKit runtime. Skipped when the runtime is unavailable.
import {officeDirectory,officePython} from '../helpers/office-kit-runtime.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile,access} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import path from 'node:path';import {tmpdir} from 'node:os';import {Store} from '../../core.mjs';import {createDocumentService} from '../../services/documents.mjs';import {createOfficeWorkspace} from '../../services/office-workspace.mjs';
const have=await access(path.join(officeDirectory,'../Frameworks/libmergedlo.dylib')).then(()=>true,()=>access(path.join(officeDirectory,'libsofficeapp.so')).then(()=>true,()=>false));
test('pages: thumbnails, slide actions and notes survive native save',{skip:!have,timeout:120000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-pages-live-')),file=path.join(dir,'in.pptx');
 execFileSync('python3',['-c',`from pptx import Presentation\nimport sys\np=Presentation()\nfor i in range(3):\n s=p.slides.add_slide(p.slide_layouts[1]);s.shapes.title.text='S%d'%(i+1)\n if i!=1:s.notes_slide.notes_text_frame.text='备注%d'%(i+1)\np.save(sys.argv[1])`,file]);
 const store=new Store(dir);await store.load();const documents=createDocumentService({store}),d=(await documents.importFile('Deck','pptx',await readFile(file))).document,kit=createOfficeWorkspace({documents,directory:path.join(dir,'kit'),runtime:async()=>({python:officePython,officeDirectory}),approve:async()=>true});
 try{
  const id=(await kit.open(d.id,1)).sessionId;
  const t=await kit.thumbnail(id,{part:2,width:200});assert.equal(t.width,200);assert.equal(Buffer.from(t.png,'base64').subarray(1,4).toString(),'PNG');
  assert.deepEqual((await kit.notesGet(id)).notes,['备注1','','备注3']);
  await kit.notesSet(id,{part:1,text:'第二页\n换行'});assert.deepEqual((await kit.notesGet(id)).notes,['备注1','第二页\n换行','备注3']);
  await kit.slideAction(id,{action:'duplicate',part:0});await kit.slideAction(id,{action:'move',part:0,to:3});await kit.slideAction(id,{action:'delete',part:1});
  assert.deepEqual((await kit.notesGet(id)).notes,['备注1','备注3','备注1']);
  await assert.rejects(kit.slideAction(id,{action:'delete',part:9}));
  const out=path.join(dir,'out.pptx');await import('node:fs/promises').then(f=>f.writeFile(out,documents.bytes(d.id,documents.read(d.id).revision).bytes));
  execFileSync('python3',['-c',`from pptx import Presentation\nimport sys\np=Presentation(sys.argv[1]);assert [s.notes_slide.notes_text_frame.text for s in p.slides]==['备注1','备注3','备注1'],[s.notes_slide.notes_text_frame.text for s in p.slides]`,out]);
 }finally{await kit.shutdown();await rm(dir,{recursive:true,force:true});}
});
