// [ux7] Live: a 182-slide deck opens in the real engine, thumbnails / notes / page actions work beyond slide 100, and it saves.
// Run: WB_TEST_OFFICE_DIRECTORY=<engine program dir> WB_TEST_PYTHON=<bundled python> node --test tests/acceptance/office-large-deck-live.mjs
import {officeDirectory,officePython} from '../helpers/office-kit-runtime.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile,writeFile,access} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import path from 'node:path';import {tmpdir} from 'node:os';
import {Store} from '../../core.mjs';import {createDocumentService} from '../../services/documents.mjs';import {createOfficeWorkspace} from '../../services/office-workspace.mjs';
const have=await access(path.join(officeDirectory,'../Frameworks/libmergedlo.dylib')).then(()=>true,()=>access(path.join(officeDirectory,'libsofficeapp.so')).then(()=>true,()=>false));
test('182-slide deck opens, pages past 100 work, and saves',{skip:!have,timeout:300000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-large-deck-')),file=path.join(dir,'big.pptx');
 execFileSync('python3',['-c',`from pptx import Presentation\nimport sys\np=Presentation()\nfor i in range(182):\n s=p.slides.add_slide(p.slide_layouts[1]);s.shapes.title.text='第%d页'%(i+1)\n if i in (0,150,181):s.notes_slide.notes_text_frame.text='备注%d'%(i+1)\np.save(sys.argv[1])`,file]);
 const store=new Store(dir);await store.load();const documents=createDocumentService({store}),d=(await documents.importFile('Big','pptx',await readFile(file))).document;
 const kit=createOfficeWorkspace({documents,directory:path.join(dir,'kit'),runtime:async()=>({python:officePython,officeDirectory}),approve:async()=>true});
 try{
  const id=(await kit.open(d.id,1)).sessionId;
  const t=await kit.thumbnail(id,{part:181,width:160});assert.equal(Buffer.from(t.png,'base64').subarray(1,4).toString(),'PNG');
  const notes=(await kit.notesGet(id)).notes;assert.equal(notes.length,182);assert.equal(notes[150],'备注151');assert.equal(notes[181],'备注182');
  await kit.slideAction(id,{action:'duplicate',part:150});
  assert.equal((await kit.notesGet(id)).notes.length,183);
  await kit.slideAction(id,{action:'move',part:151,to:0});
  const out=path.join(dir,'out.pptx');await writeFile(out,documents.bytes(d.id,documents.read(d.id).revision).bytes);
  execFileSync('python3',['-c',`from pptx import Presentation\nimport sys\np=Presentation(sys.argv[1]);s=list(p.slides);assert len(s)==183,len(s);assert s[0].shapes.title.text=='第151页',s[0].shapes.title.text`,out]);
 }finally{await kit.shutdown();await rm(dir,{recursive:true,force:true,maxRetries:30,retryDelay:100});}
});
