import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../runtime/agent.mjs';

const definitions=[{type:'function',function:{name:'action',parameters:{type:'object',properties:{},additionalProperties:false}}}];
const calls=ids=>({message:{tool_calls:ids.map(id=>({id,type:'function',function:{name:'action',arguments:'{}'}}))}});

test('late completed tool retains its real event but cancellation stops remaining batch and model',async()=>{
 const c=new AbortController();let requests=0,executions=0,resolve;const events=[];
 const pending=runAgent({messages:[],definitions,signal:c.signal,maxSteps:1,request:async()=>{requests++;return calls(['a','b'])},execute:async()=>{executions++;return await new Promise(r=>{resolve=r})},onEvent:async e=>events.push(e)});
 while(!resolve) await new Promise(r=>setImmediate(r));
 c.abort();resolve({status:'succeeded',document:{id:'real-result'}});
 await assert.rejects(pending,e=>e.name==='AbortError');
 assert.equal(requests,1);assert.equal(executions,1);assert.equal(events.length,1);assert.equal(events[0].status,'succeeded');assert.equal(events[0].result.document.id,'real-result');
});

test('cancellation while recording a completed event cannot be mistaken for a step limit',async()=>{
 const c=new AbortController();let requests=0,executions=0,events=0;
 await assert.rejects(runAgent({messages:[],definitions,signal:c.signal,maxSteps:1,request:async()=>{requests++;return calls(['a'])},execute:async()=>{executions++;return {status:'succeeded'}},onEvent:async()=>{events++;c.abort()}}),e=>e.name==='AbortError');
 assert.deepEqual([requests,executions,events],[1,1,1]);
});

test('failure to persist an already completed action remains explicit even when cancelled',async()=>{
 const c=new AbortController();let runs=0;
 await assert.rejects(runAgent({messages:[],definitions,signal:c.signal,request:async()=>calls(['a']),execute:async()=>{runs++;c.abort();return {status:'succeeded'}},onEvent:async()=>{throw Error('disk unavailable')}}),/工具执行后记录或通知失败/);
 assert.equal(runs,1);
});
