import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserService} from '../runtime/browser.mjs';

function fixture(){
 let url='https://example.test/form',sent=[];
 const win={isDestroyed:()=>false,getTitle:()=>'',webContents:{
  getURL:()=>url,getZoomFactor:()=>1,isLoadingMainFrame:()=>false,
  sendInputEvent:async event=>{sent.push(event.type);}
 }};
 const browser=new BrowserService({});browser.windows.set('w',win);
 browser.states.set('w',{epoch:1,key:'fixture',snapshot:{id:'s',url,createdAt:Date.now()}});
 const args={id:'w',snapshotId:'s',ref:'e1'};
 browser.dom=async(_id,_fn,p)=>p.operation==='describe'?{kind:'click',label:'继续'}:{x:12,y:24};
 return {browser,args,sent,navigateSilently(){url='https://other.test/page';},expire(){browser.states.get('w').snapshot.createdAt=0;}};
}

for(const change of ['navigation','expired','aborted'])test('stale '+change+' during target inspection cannot create an approval receipt',async()=>{
 const f=fixture(),controller=new AbortController();
 f.browser.dom=async()=>{if(change==='navigation')f.navigateSilently();else if(change==='expired')f.expire();else controller.abort(Error('cancelled'));return {kind:'click',label:'继续'};};
 await assert.rejects(f.browser.prepareAction('browser_click',f.args,controller.signal));
 assert.equal(f.browser.prepared.size,0);assert.deepEqual(f.sent,[]);
});

for(const change of ['navigation','expired','aborted','invalid-point'])test('stale '+change+' while locating a click sends no input',async()=>{
 const f=fixture(),controller=new AbortController();
 const request=await f.browser.prepareAction('browser_click',f.args);
 f.browser.dom=async()=>{if(change==='navigation')f.navigateSilently();else if(change==='expired')f.expire();else if(change==='aborted')controller.abort(Error('cancelled'));return change==='invalid-point'?{x:NaN,y:2}:{x:12,y:24};};
 await assert.rejects(f.browser.perform(request,controller.signal));
 assert.deepEqual(f.sent,[]);assert.equal(f.browser.prepared.size,0);
 await assert.rejects(f.browser.perform(request),/凭证/);
});

test('unchanged page sends one complete approved click',async()=>{
 const f=fixture(),request=await f.browser.prepareAction('browser_click',f.args);
 const result=await f.browser.perform(request);
 assert.equal(result.status,'clicked');assert.deepEqual(f.sent,['mouseDown','mouseUp']);
});
