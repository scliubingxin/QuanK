import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readCompletion} from '../runtime/model-stream.mjs';
import {runAgent} from '../runtime/agent.mjs';

const response=events=>new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
test('stream uses indexed primary over unindexed alternate tool call',async()=>{
 let executions=0;
 const r=response([{choices:[{delta:{tool_calls:[{index:0,id:'alt',type:'function',function:{name:'safe',arguments:'{}'}}]},finish_reason:'tool_calls'},{index:0,delta:{content:'primary'},finish_reason:'stop'}]}]);
 const answer=await runAgent({messages:[],enabled:true,definitions:[{type:'function',function:{name:'safe'}}],request:()=>readCompletion(r,{toolsEnabled:true}),execute:async()=>{executions++;}});
 assert.equal(answer.text,'primary');assert.equal(executions,0);
});
test('stream ignores packets containing only alternate indexed choices',async()=>{
 const r=response([{choices:[{index:1,delta:{content:'alternate'},finish_reason:'stop'}]},{choices:[{index:0,delta:{content:'primary'},finish_reason:'stop'}]}]);
 assert.equal((await readCompletion(r)).text,'primary');
});
test('duplicate primary choices in one stream packet are rejected',async()=>{
 const r=response([{choices:[{index:0,delta:{content:'a'}},{index:0,delta:{content:'b'},finish_reason:'stop'}]}]);
 await assert.rejects(readCompletion(r),/主响应/);
});
