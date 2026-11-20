import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserService} from '../runtime/browser.mjs';
import {spawnSync} from 'node:child_process';

test('cancel while system browser launch is pending returns no success', async()=>{
  let finish, calls=0;
  const browser=new BrowserService({shell:{openExternal:()=>{calls++;return new Promise(resolve=>finish=resolve);}}});
  const controller=new AbortController();
  const request=browser.open('https://example.test/',true,controller.signal);
  controller.abort(Error('cancelled'));
  await assert.rejects(request,/取消|cancel/);
  finish();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);
});

test('already cancelled system browser request never calls the adapter', async()=>{
  let calls=0;
  const browser=new BrowserService({shell:{openExternal:async()=>calls++}});
  const controller=new AbortController();controller.abort(Error('cancelled'));
  await assert.rejects(browser.open('https://example.test/',true,controller.signal),/cancel/);
  assert.equal(calls,0);
});

test('successful system browser request still reports launch', async()=>{
  const browser=new BrowserService({shell:{openExternal:async()=>{}}});
  assert.equal((await browser.open('https://example.test/',true)).external,true);
});

test('synchronous cancellation by adapter does not leave its rejected promise unhandled', ()=>{
  const moduleUrl=new URL('../runtime/browser.mjs',import.meta.url).href;
  const code=`import {BrowserService} from ${JSON.stringify(moduleUrl)};
    const c=new AbortController();
    const b=new BrowserService({shell:{openExternal:()=>{c.abort(Error('stop'));return Promise.reject(Error('adapter late failure'));}}});
    await b.open('https://example.test/',true,c.signal).catch(()=>{});
    await new Promise(resolve=>setTimeout(resolve,25));`;
  const result=spawnSync(process.execPath,['--unhandled-rejections=strict','--input-type=module','-e',code],{encoding:'utf8',timeout:3000});
  assert.equal(result.status,0,result.stderr);
});
