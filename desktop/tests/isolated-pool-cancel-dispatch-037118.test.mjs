import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createIsolatedWorkerPool} from '../runtime/isolated-worker-pool.mjs';

test('cancellation after acquiring an idle worker does not dispatch an action', async () => {
  let actions = 0, destroyed = 0;
  const pool = createIsolatedWorkerPool({capacity:1, create:async()=>({}), reset:async()=>true, destroy:async()=>{destroyed++;}});
  try {
    await pool.run(async()=>true);
    const controller = new AbortController();
    const request = pool.run(async()=>{actions++;}, {signal:controller.signal});
    controller.abort(Error('cancelled before dispatch'));
    await assert.rejects(request, /cancelled before dispatch/);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(actions,0);
    assert.equal(destroyed,1);
    assert.equal(await pool.run(async()=>42),42);
  } finally { await pool.close(); }
});

test('cancelling the only waiter before factory dispatch does not launch a worker', async () => {
  let created = 0;
  const pool = createIsolatedWorkerPool({capacity:1, create:async()=>{created++; return {};}, reset:async()=>true, destroy:async()=>{}});
  try {
    const controller = new AbortController();
    const request = pool.run(async()=>true, {signal:controller.signal});
    controller.abort(Error('cancelled before creation'));
    await assert.rejects(request,/cancelled before creation/);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(created,0);
    assert.equal(await pool.run(async()=>42),42);
    assert.equal(created,1);
  } finally { await pool.close(); }
});

test('cancellation inside an action does not publish its result or reuse the worker', async () => {
  let resets = 0, destroyed = 0;
  const pool = createIsolatedWorkerPool({capacity:1, create:async()=>({}), reset:async()=>{resets++;return true;}, destroy:async()=>{destroyed++;}});
  try {
    const controller = new AbortController();
    const request = pool.run(async()=>{controller.abort(Error('cancelled during action'));return 'private result';}, {signal:controller.signal});
    await assert.rejects(request,/cancelled during action/);
    assert.equal(resets,0);
    assert.equal(destroyed,1);
    assert.equal(await pool.run(async()=>42),42);
    assert.equal(resets,1);
  } finally { await pool.close(); }
});

test('a single waiting preview starts at most one worker at capacity two', async () => {
  let created = 0;
  const pool = createIsolatedWorkerPool({capacity:2,create:async()=>({id:++created}),reset:async()=>true,destroy:async()=>{}});
  try {
    assert.equal(await pool.run(async w=>w.id),1);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(created,1);
  } finally { await pool.close(); }
});

test('cancelling one active worker does not cancel an independent worker', async () => {
  let startedA,startedB,releaseB,created=0;
  const readyA=new Promise(r=>startedA=r),readyB=new Promise(r=>startedB=r),gateB=new Promise(r=>releaseB=r);
  const destroyed=[];
  const pool=createIsolatedWorkerPool({capacity:2,create:async()=>({id:++created}),reset:async()=>true,destroy:async w=>destroyed.push(w.id)});
  try {
    const controller=new AbortController();
    const a=pool.run(async(_w,signal)=>{startedA();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));},{signal:controller.signal});
    const b=pool.run(async w=>{startedB();await gateB;return w.id;});
    await Promise.all([readyA,readyB]);
    controller.abort(Error('cancel only A'));
    await assert.rejects(a,/cancel only A/);
    releaseB();const survivingId=await b;
    assert.equal(destroyed.length,1);
    assert.notEqual(destroyed[0],survivingId);
    assert.equal(pool.stats().workers,1);
  } finally {releaseB();await pool.close();}
});

test('repeated queued cancellations preserve capacity and never dispatch cancelled work', {timeout:15000}, async () => {
  let created=0,running=0,maxRunning=0,cancelledActions=0;
  const pool=createIsolatedWorkerPool({capacity:2,maxWaiting:20,timeoutMs:5000,create:async()=>({id:++created}),reset:async()=>true,destroy:async()=>{}});
  try {
    for(let round=0;round<100;round++){
      const controllers=Array.from({length:6},()=>new AbortController());
      const jobs=controllers.map((controller,i)=>pool.run(async()=>{
        if(i%2===0)cancelledActions++;
        running++;maxRunning=Math.max(maxRunning,running);
        try{await new Promise(r=>setImmediate(r));return i;}finally{running--;}
      },{signal:controller.signal}));
      for(let i=0;i<6;i+=2)controllers[i].abort(Error('cancelled stress'));
      const result=await Promise.allSettled(jobs);
      for(let i=0;i<6;i++)assert.equal(result[i].status,i%2?'fulfilled':'rejected');
      assert.equal(pool.stats().busy,0);
    }
    assert.equal(cancelledActions,0);
    assert.ok(maxRunning<=2);
  } finally {await pool.close();}
});
