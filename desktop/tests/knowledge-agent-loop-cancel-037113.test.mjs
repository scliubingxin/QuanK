import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createAgentSession} from '../services/agent-session.mjs';
import {runAgent} from '../runtime/agent.mjs';

test('real HTTP model tool loop stops when a queued knowledge search is cancelled',{timeout:5000},async()=>{
 const text='供应商合同预算与交货日期',doc={id:'d',name:'source',revision:1,text,sha256:createHash('sha256').update(text).digest('hex')};
 const agent={id:'a',name:'a',prompt:'test',knowledge:['d'],tools:[]};
 const store={data:{settings:{localEmbeddingModel:'local'},documents:[doc],agents:[agent]},save:async()=>{}};
 let embeddingRequests=0,llmRequests=0,release,firstEntered,secondApproved;
 const firstStarted=new Promise(r=>{firstEntered=r;}),approved=new Promise(r=>{secondApproved=r;});
 const embedding=createServer(async(req,res)=>{
  embeddingRequests++;res.setHeader('content-type','application/json');res.setHeader('connection','close');
  if(req.url==='/api/tags'){
   if(embeddingRequests===1){firstEntered();await new Promise(r=>{release=r;});}
   res.end(JSON.stringify({models:[{name:'local',digest:'a'.repeat(64)}]}));return;
  }
  let raw='';for await(const part of req)raw+=part;
  res.end(JSON.stringify({embeddings:JSON.parse(raw).input.map(()=>[1,0,0])}));
 });
 const llm=createServer(async(req,res)=>{
  llmRequests++;for await(const _ of req){}
  res.setHeader('content-type','application/json');res.setHeader('connection','close');
  res.end(JSON.stringify({message:{role:'assistant',content:null,tool_calls:[{id:'call-1',type:'function',function:{name:'knowledge_search',arguments:JSON.stringify({query:'合同'})}}]}}));
 });
 await new Promise((resolve,reject)=>{embedding.once('error',reject);embedding.listen(11434,'127.0.0.1',resolve);});
 await new Promise((resolve,reject)=>{llm.once('error',reject);llm.listen(0,'127.0.0.1',resolve);});
 let firstSession,secondSession;
 try{
  const c1=new AbortController(),c2=new AbortController();
  const make=(signal,approve)=>createAgentSession({agent,store,signal,approve,executeTool:async()=>({status:'succeeded',document:doc})});
  firstSession=await make(c1.signal,async()=>true);
  secondSession=await make(c2.signal,async()=>{secondApproved();return true;});
  const first=firstSession.execute('knowledge_search',{query:'预算'},c1.signal);await firstStarted;
  const request=async history=>{const response=await fetch('http://127.0.0.1:'+llm.address().port,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:history})});return response.json();};
  const second=runAgent({messages:[{role:'user',content:'查询合同'}],request,execute:(name,args,s)=>secondSession.execute(name,args,s),definitions:secondSession.definitions,signal:c2.signal,maxSteps:4});
  await approved;await new Promise(r=>setImmediate(r));c2.abort(Error('stop queued run'));
  await assert.rejects(second,/stop queued run/);assert.equal(llmRequests,1);assert.equal(embeddingRequests,1);
  release();assert.equal((await first).status,'succeeded');assert.equal(llmRequests,1);
 }finally{
  await firstSession?.close();await secondSession?.close();
  embedding.closeAllConnections();llm.closeAllConnections();
  await Promise.all([new Promise(r=>embedding.close(r)),new Promise(r=>llm.close(r))]);
 }
});
