import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readCompletion} from '../runtime/model-stream.mjs';
import {runAgent} from '../runtime/agent.mjs';
import {createServer} from 'node:http';

const response=choices=>new Response(JSON.stringify({choices}),{headers:{'content-type':'application/json'}});
test('JSON completion chooses indexed primary response instead of arrival order',async()=>{
 const deltas=[];
 const result=await readCompletion(response([{index:1,message:{role:'assistant',content:'secondary'},finish_reason:'length'},{index:0,message:{role:'assistant',content:'primary'},finish_reason:'stop'}]),{onDelta:v=>deltas.push(v)});
 assert.equal(result.text,'primary');assert.deepEqual(deltas,['primary']);
});
test('primary response length limit is respected even if another choice finishes first',async()=>{
 await assert.rejects(readCompletion(response([{index:1,message:{content:'other'},finish_reason:'stop'},{index:0,message:{content:'truncated'},finish_reason:'length'}])),e=>e.code==='MODEL_OUTPUT_LIMIT');
});
test('providers omitting indexes retain their existing single-choice response',async()=>{
 assert.equal((await readCompletion(response([{message:{content:'compatible'}}]))).text,'compatible');
 assert.equal((await readCompletion(response([{index:null,message:{content:'null index'}}]))).text,'null index');
});
test('indexed JSON response without primary choice is rejected',async()=>{
 await assert.rejects(readCompletion(response([{index:1,message:{content:'other'},finish_reason:'stop'}])),/主响应/);
 await assert.rejects(readCompletion(response([{index:0,message:{content:'a'}},{index:0,message:{content:'b'}}])),/主响应/);
});
test('real HTTP alternate tool call is not executed when primary choice is text',async()=>{
 let executions=0,requests=0;
 const server=createServer(async(req,res)=>{requests++;for await(const _ of req){};res.setHeader('content-type','application/json');res.setHeader('connection','close');res.end(JSON.stringify({choices:[{index:1,message:{role:'assistant',content:null,tool_calls:[{id:'alt',type:'function',function:{name:'safe',arguments:'{}'}}]},finish_reason:'tool_calls'},{index:0,message:{role:'assistant',content:'primary answer'},finish_reason:'stop'}]}));});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{
  const request=async()=>readCompletion(await fetch(`http://127.0.0.1:${server.address().port}/`,{method:'POST'}),{toolsEnabled:true});
  const result=await runAgent({messages:[{role:'user',content:'test'}],request,execute:async()=>{executions++;},definitions:[{type:'function',function:{name:'safe'}}],enabled:true,maxSteps:2});
  assert.equal(result.text,'primary answer');assert.equal(executions,0);assert.equal(requests,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
