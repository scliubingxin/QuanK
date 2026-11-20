// [lane:pages]
import {test} from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {readFile,mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath} from 'node:url';
import {LruCache,normalizeSlideAction,normalizeThumbnail,normalizeNotesWrite,createSlideshowState,slideshowKeyEvent,railKeyTarget,masterRows,reorderIndices} from '../src/shared/office-pages.js';

test('LRU evicts least recently used and refreshes on get',()=>{
 const c=new LruCache(2);c.set('a',1).set('b',2);assert.equal(c.get('a'),1);c.set('c',3);
 assert.deepEqual(c.keys(),['a','c']);assert.equal(c.get('b'),undefined);assert.equal(c.size,2);
 c.set('a',9);assert.deepEqual(c.keys(),['c','a']);c.clear();assert.equal(c.size,0);
 assert.throws(()=>new LruCache(0));
});
test('slide actions use a whitelist and validate parameters',()=>{
 assert.deepEqual(normalizeSlideAction({action:'insert',part:2},5),{action:'insert',part:2});
 assert.deepEqual(normalizeSlideAction({op:'slideAction',action:'move',part:0,to:3},5),{action:'move',part:0,to:3});
 for(const bad of [null,{action:'exec',part:0},{action:'delete',part:5},{action:'delete',part:-1},{action:'delete',part:1.5},{action:'move',part:1,to:1},{action:'move',part:1,to:9},{action:'move',part:1},{action:'insert',part:0,uno:'.uno:Quit'},{action:'insert',part:'0'}])assert.throws(()=>normalizeSlideAction(bad,5),undefined,JSON.stringify(bad));
 assert.throws(()=>normalizeSlideAction({action:'delete',part:0},1),/唯一/);
 assert.throws(()=>normalizeSlideAction({action:'duplicate',part:0},1000),/1000/);
});
test('thumbnail and notes parameters are bounded',()=>{
 assert.deepEqual(normalizeThumbnail({part:1},3),{part:1,width:240});
 assert.throws(()=>normalizeThumbnail({part:3},3));assert.throws(()=>normalizeThumbnail({part:0,width:5000}));assert.throws(()=>normalizeThumbnail({part:0,width:240,path:'/x'}));
 assert.deepEqual(normalizeNotesWrite({part:0,text:'中文'},2),{part:0,text:'中文'});
 assert.throws(()=>normalizeNotesWrite({part:0,text:'x'.repeat(8001)}));assert.throws(()=>normalizeNotesWrite({part:0,text:'a\0'}));assert.throws(()=>normalizeNotesWrite({part:0,text:1}));
});
test('slideshow state machine pages through an end screen and exits',()=>{
 const s=createSlideshowState(3,1);assert.deepEqual(s.state,{index:1,count:3,active:true,ended:false});
 s.dispatch('prev');s.dispatch('prev');assert.equal(s.state.index,0);
 s.dispatch('next');s.dispatch('click');assert.equal(s.state.index,2);
 assert.equal(s.dispatch('next').ended,true);assert.equal(s.state.index,3);
 assert.equal(s.dispatch('prev').index,2);s.dispatch('next');assert.equal(s.dispatch('click').active,false);
 assert.equal(s.dispatch('next').active,false);
 const e=createSlideshowState(2);e.dispatch('last');assert.equal(e.state.index,1);e.dispatch('first');assert.equal(e.state.index,0);assert.equal(e.dispatch('exit').active,false);
 assert.equal(createSlideshowState(3,99).state.index,2);assert.throws(()=>createSlideshowState(0));
 assert.equal(slideshowKeyEvent(' '),'next');assert.equal(slideshowKeyEvent('PageUp'),'prev');assert.equal(slideshowKeyEvent('Escape'),'exit');assert.equal(slideshowKeyEvent('a'),null);
});
test('rail keys clamp and master rows indent layouts',()=>{
 assert.equal(railKeyTarget('ArrowDown',0,3),1);assert.equal(railKeyTarget('ArrowDown',2,3),2);assert.equal(railKeyTarget('PageUp',0,3),0);assert.equal(railKeyTarget('x',0,3),null);
 assert.deepEqual(masterRows(['A','']).map(r=>[r.kind,r.label]),[['master','母版'],['layout','A'],['layout','版式 2']]);
 assert.deepEqual(reorderIndices(4,0,2),[1,2,0,3]);
});

// OOXML notes round trip with a python-pptx generated deck. The helper block is extracted from worker.py so no LibreOffice is needed.
const here=fileURLToPath(new URL('.',import.meta.url));
const probe=`
import sys,re,io,html,json
src=open(sys.argv[1],encoding='utf8').read()
block=src[src.index('# [lane:pages] ooxml-begin'):src.index('# [lane:pages] ooxml-end')]
exec(block)
from pptx import Presentation
p=Presentation()
for i in range(3):
    s=p.slides.add_slide(p.slide_layouts[1]);s.shapes.title.text='S%d'%i
    if i!=1:s.notes_slide.notes_text_frame.text='备注%d & <x>'%i
buf=io.BytesIO();p.save(buf);data=buf.getvalue()
assert ox_notes_all(data)==['备注0 & <x>','','备注2 & <x>'],ox_notes_all(data)
out=ox_write_notes(data,1,'新建\\n第二行 "引号"')       # slide without notes: part is created
out=ox_write_notes(out,0,'改写')                          # existing notes replaced
assert ox_notes_all(out)==['改写','新建\\n第二行 "引号"','备注2 & <x>'],ox_notes_all(out)
q=Presentation(io.BytesIO(out))
assert [s.notes_slide.notes_text_frame.text for s in q.slides]==['改写','新建\\n第二行 "引号"','备注2 & <x>']
assert [s.shapes.title.text for s in q.slides]==['S0','S1','S2']
assert ox_notes_all(ox_write_notes(out,0,''))[0]==''
for bad in [(5,'x'),(-1,'x'),(0,'a'*8001),(0,None)]:
    try:ox_write_notes(out,*bad);raise SystemExit('accepted '+repr(bad))
    except ValueError:pass
assert ox_masters(data)[0]['layouts'][0]=='Title Slide' and ox_animations(data,0)==[]
print('ok')
`;
test('notes read/write round trip on a python-pptx deck',async()=>{
 const worker=path.join(here,'../runtime/office-kit/worker.py');
 assert.equal(execFileSync('python3',['-c',probe,worker],{encoding:'utf8'}).trim(),'ok');
});
test('worker exposes only whitelisted slide actions and keeps the generated bundle in sync',async()=>{
 const s=await readFile(path.join(here,'../runtime/office-kit/worker.py'),'utf8');
 assert.match(s,/SLIDE_COMMANDS=\{'insert':b'\.uno:InsertPage','duplicate':b'\.uno:DuplicatePage','delete':b'\.uno:DeletePage'\}/);
 assert.match(s,/action not in \['insert','duplicate','delete','move'\]/);
 execFileSync('python3',[path.join(here,'../../scripts/bundle-office-worker.py'),'--check']);
});
