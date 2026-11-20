import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAgentSession} from '../services/agent-session.mjs';
import {configureLocalOnnx} from '../services/knowledge-vector.mjs';
import {LOCAL_ONNX_MODEL} from '../runtime/local-onnx-embedding.mjs';

function fixture(){
 const docs=['汽车预算报告','供应商合同'].map((text,i)=>({id:'d'+i,name:'d'+i,revision:1,text,sha256:createHash('sha256').update(text).digest('hex')}));
 const agent={id:'a',name:'a',prompt:'test',knowledge:docs.map(d=>d.id),tools:[]};
 const store={data:{settings:{localEmbeddingModel:LOCAL_ONNX_MODEL},documents:docs,agents:[agent]},save:async()=>{}};
 return {docs,agent,store};
}
for(const phase of ['first-read','second-read','vector-approval'])test('cancelling a stalled '+phase+' never starts later knowledge steps',{timeout:3000},async()=>{
 const f=fixture(),controller=new AbortController();let started,release,reads=0,approvals=0,models=0;
 const ready=new Promise(r=>{started=r;}),pending=new Promise(r=>{release=r;});
 configureLocalOnnx(f.store,async()=>{models++;throw Error('should not start');});
 const executeTool=async(_name,{id})=>{reads++;if((phase==='first-read'&&reads===1)||(phase==='second-read'&&reads===2)){started();await pending;}return {status:'succeeded',document:f.docs.find(d=>d.id===id)};};
 const approve=async()=>{approvals++;if(phase==='vector-approval'){started();await pending;}return true;};
 const session=await createAgentSession({agent:f.agent,store:f.store,executeTool,approve,signal:controller.signal});
 const run=session.execute('knowledge_search',{query:'预算'},controller.signal);
 await ready;controller.abort(Error('stop knowledge'));await assert.rejects(run,/stop knowledge/);
 const previousReads=reads;release();await new Promise(r=>setImmediate(r));
 assert.equal(reads,previousReads);assert.equal(models,0);
 assert.equal(approvals,phase==='vector-approval'?1:0);
 assert.equal(f.store.data.knowledgeVectorIndexes,undefined);await session.close();
});
test('denial after source revision changes is not returned as a current authorization decision',async()=>{
 const f=fixture();let models=0;configureLocalOnnx(f.store,async()=>{models++;});
 const session=await createAgentSession({agent:f.agent,store:f.store,
  executeTool:async(_,{id})=>({status:'succeeded',document:f.docs.find(d=>d.id===id)}),
  approve:async()=>{f.store.data.documents[0].revision++;return false;}});
 try{await assert.rejects(session.execute('knowledge_search',{query:'预算'}),/已变化/);assert.equal(models,0);}
 finally{await session.close();}
});
test('two real agent sessions serialize local-model HTTP and a cancelled queued session sends no request',{timeout:5000},async()=>{
 const {createServer}=await import('node:http');const f=fixture();f.store.data.settings.localEmbeddingModel='local';
 let calls=0,release,started;const firstRequest=new Promise(r=>{started=r;});
 const server=createServer(async(req,res)=>{
  calls++;res.setHeader('content-type','application/json');res.setHeader('connection','close');
  if(req.url==='/api/tags'){
   if(calls===1){started();await new Promise(r=>{release=r;});}
   res.end(JSON.stringify({models:[{name:'local',digest:'a'.repeat(64)}]}));return;
  }
  let raw='';for await(const b of req)raw+=b;
  res.end(JSON.stringify({embeddings:JSON.parse(raw).input.map(()=>[1,0,0])}));
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(11434,'127.0.0.1',resolve);});
 let a,b;
 try{
  const make=async signal=>createAgentSession({agent:f.agent,store:f.store,signal,approve:async()=>true,executeTool:async(_,{id})=>({status:'succeeded',document:f.docs.find(d=>d.id===id)})});
  const first=new AbortController(),second=new AbortController();a=await make(first.signal);b=await make(second.signal);
  const one=a.execute('knowledge_search',{query:'预算'},first.signal);await firstRequest;
  const two=b.execute('knowledge_search',{query:'合同'},second.signal);
  await new Promise(r=>setImmediate(r));second.abort(Error('cancel second session'));
  await assert.rejects(two,/cancel second session/);assert.equal(calls,1);
  release();const result=await one;assert.equal(result.status,'succeeded');assert.ok(result.matches.length>0);
 }finally{await a?.close();await b?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
