import test from 'node:test';
import assert from 'node:assert/strict';
import {readCompletion} from '../runtime/model-stream.mjs';

for (const format of ['json','sse']) test('abort stops waiting for a stalled '+format+' output callback',{timeout:4000},async()=>{
 const payload=format==='json'?JSON.stringify({choices:[{message:{role:'assistant',content:'first'},finish_reason:'stop'}]}):'data: '+JSON.stringify({choices:[{index:0,delta:{content:'first'}}]})+'\n\ndata: '+JSON.stringify({choices:[{index:0,delta:{content:'second'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n';
 const response=new Response(payload,{headers:{'content-type':format==='json'?'application/json':'text/event-stream'}});
 const ctrl=new AbortController();let started;const entered=new Promise(r=>started=r);let release;const hold=new Promise(r=>release=r);const seen=[];
 const run=readCompletion(response,{signal:ctrl.signal,onDelta:async value=>{seen.push(value);started();await hold;}});
 await entered;ctrl.abort(Error('user cancelled'));await assert.rejects(run,/user cancelled/);release();await new Promise(r=>setImmediate(r));assert.deepEqual(seen,['first']);
});
test('callback failures propagate without resuming stream',async()=>{
 const payload='data: '+JSON.stringify({choices:[{index:0,delta:{content:'first'}}]})+'\n\n';
 await assert.rejects(readCompletion(new Response(payload,{headers:{'content-type':'text/event-stream'}}),{onDelta:()=>{throw Error('checkpoint failed')}}),/checkpoint failed/);
});
