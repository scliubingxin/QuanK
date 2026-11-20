// [lane:pages] DOM-level smoke tests for rail, notes and slideshow with a fake bridge.
import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
const dom=new JSDOM('<body><main><section id="editor"><div id="parts"></div></section></main></body>',{pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document});
const {bus}=await import('../src/office/bus.js');
const {createSlideRail}=await import('../src/office/slide-rail.js');
const {createNotes}=await import('../src/office/notes.js');
const {createSlideshow}=await import('../src/office/slideshow.js');
const tick=()=>new Promise(r=>setTimeout(r,5));
function bridge(){const calls=[];let notes=['n0','','n2'];return {calls,invoke:async(op,p)=>{calls.push([op,p]);
 if(op==='thumbnail')return {png:'AAAA',width:240,height:180,part:p.part,count:3};
 if(op==='slideAction')return {count:p.action==='delete'?2:4,part:p.part};
 if(op==='notesGet')return {notes};if(op==='notesSet'){notes[p.part]=p.text;return {};}
 throw Error('unexpected '+op);}};}
test('rail renders pages, highlights current, navigates by keyboard and sends whitelisted actions',async()=>{
 const api=bridge(),rail=createSlideRail({bus,api,thumbWidth:200}),gotos=[];bus.on('slide:goto',d=>gotos.push(d.index));
 bus.emit('doc:drawn',{part:1,count:3,names:['a','b','c'],revision:1,sequence:0});await tick();
 const items=[...document.querySelectorAll('.wb-rail-item')];assert.equal(items.length,3);assert.ok(items[1].classList.contains('current'));assert.equal(document.querySelector('.wb-rail-add').textContent,'添加页面');
 assert.ok(api.calls.filter(c=>c[0]==='thumbnail').length>=1);
 document.querySelector('#wb-rail-list').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.deepEqual(gotos,[2]);
 items[0].click();assert.deepEqual(gotos,[2,0]);
 await rail.act('duplicate',1);assert.deepEqual(api.calls.find(c=>c[0]==='slideAction')[1],{action:'duplicate',part:1});
 rail.openMenu(5,5,1);assert.deepEqual([...document.querySelectorAll('.wb-menu-item')].map(b=>b.textContent),['新建页面','复制页面','删除页面','上移','下移']);rail.closeMenu();
});
test('notes show placeholder, write back changed text for the page it was typed on',async()=>{
 const api=bridge(),notes=createNotes({bus,api,debounceMs:10});await notes.load(0);
 assert.equal(notes.area.placeholder,'单击此处添加备注');assert.equal(notes.area.value,'n0');
 notes.area.value='changed';notes.area.dispatchEvent(new dom.window.Event('input'));
 bus.emit('slide:changed',{index:1,count:3});await tick();await tick();
 assert.deepEqual(api.calls.find(c=>c[0]==='notesSet')[1],{part:0,text:'changed'});assert.equal(notes.area.value,'');
});
test('slideshow pages with keys, shows end screen and exits',async()=>{
 const api=bridge(),show=createSlideshow({bus,api,getCount:()=>2,getCurrent:()=>1});let ended=0;bus.on('show:end',()=>ended++);
 await show.start('current');assert.equal(show.state.index,1);assert.ok(document.querySelector('.wb-show'));
 document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await tick();
 assert.equal(document.querySelector('.wb-show-end').textContent,'放映结束，单击退出');
 document.querySelector('.wb-show').click();assert.equal(document.querySelector('.wb-show'),null);assert.equal(ended,1);
});
