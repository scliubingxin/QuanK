import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserService} from '../runtime/browser.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){let finish;const pending=new Promise(r=>finish=r);const url='https://example.test/';const win={isDestroyed:()=>false,getTitle:()=>'',webContents:{getURL:()=>url,executeJavaScript:()=>pending}};const b=new BrowserService({});b.windows.set('w',win);b.states.set('w',{epoch:1,key:'k',snapshot:null});return {b,win,finish,url};}
test('cancelled browser read returns no late page content',async()=>{const f=fixture(),c=new AbortController();const p=f.b.read('w',c.signal);c.abort(Error('cancelled'));await assert.rejects(p,/取消|cancel/);f.finish('private late content');await tick();});
test('cancelled snapshot cannot publish late refs even if adapter ignores abort',async()=>{const f=fixture(),c=new AbortController();f.b.dom=async()=>{c.abort(Error('stop'));return {url:f.url,elements:[{ref:'e1'}]};};await assert.rejects(f.b.snapshot('w',c.signal),/stop/);assert.equal(f.b.states.get('w').snapshot,null);});
test('snapshot post-await URL validation observes cancellation before publishing',async()=>{const f=fixture(),c=new AbortController();let calls=0;f.win.webContents.getURL=()=>{if(++calls===2)c.abort(Error('stop'));return f.url;};f.b.dom=async()=>({url:f.url,elements:[]});await assert.rejects(f.b.snapshot('w',c.signal),/stop/);assert.equal(f.b.states.get('w').snapshot,null);});
test('uncancelled read still returns the verified page text',async()=>{const f=fixture();const p=f.b.read('w');f.finish('contents');assert.equal((await p).text,'contents');});
test('read abort triggered by navigation-state check returns no page content',async()=>{const f=fixture(),c=new AbortController();let calls=0;f.win.webContents.getURL=()=>{if(++calls===3)c.abort(Error('stop'));return f.url;};const p=f.b.read('w',c.signal);f.finish('sensitive content');await assert.rejects(p,/stop/);});
