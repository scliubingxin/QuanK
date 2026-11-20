import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createVectorIndex} from '../services/knowledge-vector.mjs';

function fixture(){
 const text='汽车采用电池和电机',d={id:'a',name:'a',revision:1,text,sha256:createHash('sha256').update(text).digest('hex')};
 const store={data:{settings:{localEmbeddingModel:'local'},documents:[d]},save:async()=>{}};
 let release,entered;const started=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});let count=0;
 const service=createVectorIndex({store,identity:async()=>{if(++count===1){entered();await gate;}return 'a'.repeat(64);},embedder:async(_m,rows)=>rows.map(()=>[1,0,0])});
 const opts={documents:[d],query:'新能源',model:'local',check:()=>{}};
 return {service,store,opts,started,release,calls:()=>count};
}

test('queued cancellation returns immediately and the next approved search still executes in order',{timeout:3000},async()=>{
 const f=fixture(),first=f.service.searchApproved(f.opts);await f.started;
 const ctrl=new AbortController(),cancelled=f.service.searchApproved({...f.opts,signal:ctrl.signal});
 const last=f.service.searchApproved(f.opts);ctrl.abort(Error('cancel queued vector'));
 await assert.rejects(cancelled,/cancel queued vector/);assert.equal(f.calls(),1);
 f.release();assert.equal((await first).status,'succeeded');assert.equal((await last).status,'succeeded');
 assert.equal(f.calls(),5); // first builds and verifies on save; second reuses
});
test('full wait queue is bounded; cancellation frees a slot without executing queued work',{timeout:3000},async()=>{
 const f=fixture(),first=f.service.searchApproved(f.opts);await f.started;
 const controllers=Array.from({length:20},()=>new AbortController());
 const pending=controllers.map(c=>f.service.searchApproved({...f.opts,signal:c.signal}));
 const results=Promise.allSettled(pending);
 await assert.rejects(f.service.searchApproved(f.opts),/队列已满/);
 for(const c of controllers)c.abort(Error('cancelled'));
 assert.ok((await results).every(x=>x.status==='rejected'));
 const next=f.service.searchApproved(f.opts);
 f.release();await first;assert.equal((await next).status,'succeeded');
 assert.equal(f.calls(),5);
});
test('clear waits for earlier writes and search failure does not stall the queue',async()=>{
 const f=fixture(),first=f.service.searchApproved(f.opts);await f.started;
 const clear=f.service.clear();f.release();await first;await clear;
 assert.equal(f.store.data.knowledgeVectorIndexes,undefined);
 const bad=f.service.searchApproved({...f.opts,query:''});
 const good=f.service.searchApproved(f.opts);
 await assert.rejects(bad);assert.equal((await good).status,'succeeded');
});
test('a queued cancellation does not send a second request to the real local HTTP model',{timeout:5000},async()=>{
 const {createServer}=await import('node:http');let requests=0,release,entered;
 const started=new Promise(r=>{entered=r;});
 const server=createServer(async(req,res)=>{
  requests++;res.setHeader('content-type','application/json');res.setHeader('connection','close');
  if(req.url==='/api/tags'){
   if(requests===1){await new Promise(r=>{release=r;});entered=()=>{};}
   res.end(JSON.stringify({models:[{name:'local',digest:'a'.repeat(64)}]}));return;
  }
  let raw='';for await(const b of req)raw+=b;
  const input=JSON.parse(raw).input;res.end(JSON.stringify({embeddings:input.map(()=>[1,0,0])}));
 });
 server.on('request',()=>{if(requests===1)entered();});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(11434,'127.0.0.1',resolve);});
 try{
  const f=fixture(),service=createVectorIndex({store:f.store}),first=service.searchApproved(f.opts);
  await started;const controller=new AbortController(),queued=service.searchApproved({...f.opts,signal:controller.signal});
  controller.abort(Error('stop while queued'));await assert.rejects(queued,/stop while queued/);
  assert.equal(requests,1);release();assert.equal((await first).status,'succeeded');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
