import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ToolRuntime} from '../runtime/tools.mjs';
import {BrowserService} from '../runtime/browser.mjs';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('cancel while browser approval hangs releases the tool and rejects late approval', {timeout:2500}, async()=>{
 let release,entered,openCalls=0;const ready=new Promise(r=>entered=r);
 const store={data:{executions:[]},save:async()=>{},log:()=>{}};
 const browser=new BrowserService({shell:{openExternal:async()=>{openCalls++;}}});
 const runtime=new ToolRuntime({store,browser,approve:()=>{entered();return new Promise(r=>release=r);}});
 const controller=new AbortController(),request=runtime.execute('browser_open',{url:'https://example.test/',external:true},controller.signal);
 await ready;controller.abort(Error('cancel approval'));
 try{
  await assert.rejects(Promise.race([request,new Promise((_,reject)=>setTimeout(()=>reject(Error('approval did not stop')),300))]),/cancel approval/);
  assert.equal(store.data.executions[0].status,'cancelled');
 }finally{release(true);}
 await new Promise(r=>setImmediate(r));assert.equal(openCalls,0);
});

test('cancel while CLI approval hangs prevents the real child from starting', {timeout:3000}, async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-approval-cli-'));let release,entered;
 const ready=new Promise(r=>entered=r),store={data:{executions:[],folders:[{id:'f',path:dir}]},save:async()=>{},log:()=>{}};
 const runtime=new ToolRuntime({store,browser:{},approve:()=>{entered();return new Promise(r=>release=r);}});
 const controller=new AbortController(),request=runtime.execute('cli_execute',{folderId:'f',executable:process.execPath,args:['-e',"require('fs').writeFileSync('sentinel','ran')"]},controller.signal);
 try{
  await ready;controller.abort(Error('cancel CLI approval'));
  await assert.rejects(Promise.race([request,new Promise((_,reject)=>setTimeout(()=>reject(Error('approval did not stop')),500))]),/cancel CLI approval/);
  release(true);await new Promise(r=>setTimeout(r,60));
  await assert.rejects(access(path.join(dir,'sentinel')));
  assert.equal(store.data.executions[0].status,'cancelled');
 }finally{release?.(true);await rm(dir,{recursive:true,force:true});}
});

test('late task-wide browser approval after cancellation grants no origin access', {timeout:2500}, async()=>{
 let release,entered,reads=0;const ready=new Promise(r=>entered=r),url='https://example.test/page';
 const store={data:{executions:[]},save:async()=>{},log:()=>{}};
 const browser={list:()=>[{id:'w',url}],read:async()=>{reads++;return {status:'read'};}};
 const runtime=new ToolRuntime({store,browser,approve:()=>{entered();return new Promise(r=>release=r);}});
 const controller=new AbortController(),args={id:'w'};
 const request=runtime.execute('browser_read',args,controller.signal,{runId:'run'});
 await ready;controller.abort(Error('cancel permission'));
 try{await assert.rejects(request,/cancel permission/);}finally{release({allowed:true,browserTask:true});}
 await new Promise(r=>setImmediate(r));
 const scope=runtime.browserPermissions.scope('browser_read',args,{runId:'run',readScope:{id:'w',url}});
 assert.equal(runtime.browserPermissions.has(scope),false);assert.equal(reads,0);
});
