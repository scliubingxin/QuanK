import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createVectorIndex,validateEmbeddingModel,embeddingModelDigest} from '../services/knowledge-vector.mjs';
const doc=(id,text)=>({id,name:id,revision:1,text,sha256:createHash('sha256').update(text).digest('hex')});
function fixture(){const docs=[doc('a','汽车采用电池和电机'),doc('b','合同履约条款与风险')],store={data:{settings:{localEmbeddingModel:'local-embed'},documents:docs.map(({text,...d})=>d)},save:async()=>{}};let calls=0;const embedder=async(_m,rows)=>{calls++;return rows.map(t=>/汽车|电池|新能源/.test(t)?[1,0,0]:[0,1,0]);};const service=createVectorIndex({store,embedder,identity:async()=> 'a'.repeat(64)});return {docs,store,service,calls:()=>calls};}
const run=(f,query='新能源汽车')=>f.service.searchApproved({documents:f.docs,query,model:'local-embed',check:()=>{}});
test('local vector retrieval matches semantic mock with no lexical match, preserves source coordinates, persists and reuses',async()=>{const f=fixture(),out=await run(f);assert.equal(out.matches[0].source.id,'a');assert.equal(out.matches[0].text,'汽车采用电池和电机');assert.equal(out.index.built,2);assert.equal(out.index.dimension,3);assert.ok(!JSON.stringify(f.store.data.knowledgeVectorIndexes).includes('汽车采用'));const again=await run(f);assert.equal(again.index.reused,2);assert.equal(f.calls(),4);await f.service.clear();assert.equal(f.store.data.knowledgeVectorIndexes,undefined);});
test('model or source changes, bad vectors and cancellation do not publish index',async()=>{const f=fixture();await assert.rejects(f.service.searchApproved({documents:f.docs,query:'x',model:'other',check:()=>{}}),/配置已改变/);assert.equal(f.store.data.knowledgeVectorIndexes,undefined);let changes=0;const service=createVectorIndex({store:f.store,identity:async()=>++changes===1?'a'.repeat(64):'b'.repeat(64),embedder:async(_m,rows)=>rows.map(()=>[1,0])});await assert.rejects(service.searchApproved({documents:f.docs,query:'x',model:'local-embed',check:()=>{}}),/模型在检索期间发生变化/);assert.equal(f.store.data.knowledgeVectorIndexes,undefined);const bad=createVectorIndex({store:f.store,identity:async()=> 'a'.repeat(64),embedder:async(_m,rows)=>rows.map(()=>[NaN,0])});await assert.rejects(bad.searchApproved({documents:f.docs,query:'x',model:'local-embed',check:()=>{}}),/向量无效/);const ctrl=new AbortController();ctrl.abort();await assert.rejects(f.service.searchApproved({documents:f.docs,query:'x',model:'local-embed',signal:ctrl.signal,check:()=>{}}));});
test('source update rebuilds and corrupted cache cannot change result',async()=>{const f=fixture();await run(f);f.store.data.knowledgeVectorIndexes[0].vectors[0][0]=100;const r=await run(f);assert.equal(r.index.built,1);f.docs[0]={...doc('a','新能源新资料'),revision:2};f.store.data.documents[0]=f.docs[0];const changed=await run(f);assert.equal(changed.index.built,1);assert.equal(changed.matches[0].source.revision,2);});
test('model names prohibit URLs and arbitrary local targets',()=>{for(const v of ['http://host','x?bad','', '../x','x space'])assert.throws(()=>validateEmbeddingModel(v));assert.equal(validateEmbeddingModel('nomic-embed-text:latest'),'nomic-embed-text:latest');});
test('model catalog rejects conflicting or malformed entries for the selected name',()=>{
 const a='a'.repeat(64),b='b'.repeat(64),model='local-embed';
 assert.equal(embeddingModelDigest([{name:model,digest:a},{model,digest:a}],model),a);
 assert.throws(()=>embeddingModelDigest([{name:model,digest:a},{model,digest:b}],model),/冲突/);
 assert.throws(()=>embeddingModelDigest([{name:model,digest:a},{model,digest:null}],model),/无法确认/);
 assert.throws(()=>embeddingModelDigest([null,{name:'different',digest:a}],model),/不存在/);
});
test('real loopback HTTP embedding protocol uses bounded model digest and reuses persisted vectors',async()=>{const {createServer}=await import('node:http');const server=createServer(async(req,res)=>{res.setHeader('content-type','application/json');res.setHeader('connection','close');if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'local-embed',digest:'a'.repeat(64)}]}));return;}if(req.url==='/api/embed'){let body='';for await(const part of req)body+=part;const p=JSON.parse(body);assert.equal(p.model,'local-embed');assert.equal(p.truncate,false);res.end(JSON.stringify({embeddings:p.input.map(t=>/汽车|电池|新能源/.test(t)?[1,0,0]:[0,1,0])}));return;}res.statusCode=404;res.end('{}');});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(11434,'127.0.0.1',resolve)});try{const f=fixture();f.service=createVectorIndex({store:f.store});const result=await run(f);assert.equal(result.matches[0].source.id,'a');assert.equal((await run(f)).index.reused,2);}finally{await new Promise(resolve=>server.close(resolve));}});
test('agent knowledge_search requires source and separate embedding approval before local HTTP service',async()=>{const {createAgentSession}=await import('../services/agent-session.mjs');const {createServer}=await import('node:http');const f=fixture();f.store.data.agents=[{id:'a1',name:'demo',prompt:'test',knowledge:['a','b'],tools:[]}];let requests=0,allow=false,reads=0;const server=createServer(async(req,res)=>{requests++;res.setHeader('content-type','application/json');res.setHeader('connection','close');if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'local-embed',digest:'a'.repeat(64)}]}));return;}let raw='';for await(const b of req)raw+=b;const p=JSON.parse(raw);res.end(JSON.stringify({embeddings:p.input.map(t=>/汽车|电池|新能源/.test(t)?[1,0,0]:[0,1,0])}));});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(11434,'127.0.0.1',resolve)});try{const session=await createAgentSession({agent:f.store.data.agents[0],store:f.store,executeTool:async(_name,{id})=>{reads++;return {status:'succeeded',document:f.docs.find(d=>d.id===id)}},approve:async()=>allow});assert.match(JSON.stringify(session.definitions),/向量.*检索/);let r=await session.execute('knowledge_search',{query:'新能源汽车'});assert.equal(r.status,'denied');assert.equal(requests,0);assert.equal(reads,2);allow=true;r=await session.execute('knowledge_search',{query:'新能源汽车'});assert.equal(r.matches[0].source.id,'a');assert.ok(requests>0);await session.close();}finally{await new Promise(resolve=>server.close(resolve));}});
test('disk failure and version change after index write roll back vector cache',async()=>{const f=fixture();let saves=0;f.store.save=async()=>{saves++;throw Error('disk unavailable')};await assert.rejects(run(f),/disk unavailable/);assert.equal(f.store.data.knowledgeVectorIndexes,undefined);f.store.save=async()=>{saves++;if(saves===2)f.store.data.documents[0].revision=2};await assert.rejects(run(f),/知识来源已变化/);assert.equal(f.store.data.knowledgeVectorIndexes,undefined);assert.equal(saves,3);});
test('model replacement during index save rolls back persisted cache and returns no results',async()=>{
 const f=fixture(),previous=[{version:0,marker:'previous'}];f.store.data.knowledgeVectorIndexes=previous;
 let current='a'.repeat(64),disk=structuredClone(previous),saves=0;
 f.store.save=async()=>{disk=structuredClone(f.store.data.knowledgeVectorIndexes);if(++saves===1)current='b'.repeat(64);};
 const service=createVectorIndex({store:f.store,identity:async()=>current,embedder:async(_m,rows)=>rows.map(()=>[1,0,0])});
 await assert.rejects(service.searchApproved({documents:f.docs,query:'budget',model:'local-embed',check:()=>{}}),/保存索引期间发生变化/);
 assert.deepEqual(f.store.data.knowledgeVectorIndexes,previous);assert.deepEqual(disk,previous);assert.equal(saves,2);
});
test('failure to verify model after saving does not publish a result',async()=>{
 const f=fixture();let ids=0,saves=0;f.store.save=async()=>{saves++};
 const service=createVectorIndex({store:f.store,identity:async()=>{if(++ids===3)throw Error('catalog unavailable');return 'a'.repeat(64)},embedder:async(_m,rows)=>rows.map(()=>[1,0,0])});
 await assert.rejects(service.searchApproved({documents:f.docs,query:'budget',model:'local-embed',check:()=>{}}),/catalog unavailable/);
 assert.equal(f.store.data.knowledgeVectorIndexes,undefined);assert.equal(saves,2);
});
test('real local HTTP model replacement during persistence fails closed and rolls back',async()=>{
 const {createServer}=await import('node:http');let current='a'.repeat(64),tags=0,embeds=0;
 const server=createServer(async(req,res)=>{res.setHeader('content-type','application/json');res.setHeader('connection','close');
  if(req.url==='/api/tags'){tags++;res.end(JSON.stringify({models:[{name:'local-embed',digest:current}]}));return;}
  if(req.url==='/api/embed'){let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);embeds++;res.end(JSON.stringify({embeddings:body.input.map(()=>[1,0,0])}));return;}
  res.statusCode=404;res.end('{}');
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(11434,'127.0.0.1',resolve)});
 try{
  const f=fixture(),old=[{version:0,marker:'previous'}];f.store.data.knowledgeVectorIndexes=old;let disk=structuredClone(old),saves=0;
  f.store.save=async()=>{disk=structuredClone(f.store.data.knowledgeVectorIndexes);if(++saves===1)current='b'.repeat(64)};
  f.service=createVectorIndex({store:f.store});await assert.rejects(run(f),/保存索引期间发生变化/);
  assert.deepEqual(disk,old);assert.deepEqual(f.store.data.knowledgeVectorIndexes,old);assert.equal(saves,2);assert.equal(tags,3);assert.equal(embeds,3);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('failed rollback reports uncertain persisted state and never returns matches',async()=>{
 const f=fixture();let ids=0,saves=0;
 f.store.save=async()=>{if(++saves===2)throw Error('disk failure')};
 const service=createVectorIndex({store:f.store,identity:async()=>++ids===3?'b'.repeat(64):'a'.repeat(64),embedder:async(_m,rows)=>rows.map(()=>[1,0,0])});
 await assert.rejects(service.searchApproved({documents:f.docs,query:'budget',model:'local-embed',check:()=>{}}),/回滚失败，未返回检索结果/);
 assert.equal(f.store.data.knowledgeVectorIndexes,undefined);assert.equal(saves,2);
});
test('changing embedding model digest invalidates saved vectors',async()=>{const f=fixture();let id='a'.repeat(64),calls=0;const service=createVectorIndex({store:f.store,identity:async()=>id,embedder:async(_m,rows)=>{calls++;return rows.map(()=>[1,0,0])}});const opts={documents:f.docs,query:'text',model:'local-embed',check:()=>{}};assert.equal((await service.searchApproved(opts)).index.built,2);id='b'.repeat(64);assert.equal((await service.searchApproved(opts)).index.built,2);assert.equal(calls,6);});
test('hybrid lexical retrieval preserves exact identifier matches when semantic cosine misses',async()=>{const d=doc('contract','Reference CONTRACT-2026-A and the delivery terms'),store={data:{settings:{localEmbeddingModel:'local-embed'},documents:[d]},save:async()=>{}};const service=createVectorIndex({store,identity:async()=> 'a'.repeat(64),embedder:async(_m,rows)=>rows.map(s=>s==='CONTRACT-2026-A'?[0,1,0]:[1,0,0])});const r=await service.searchApproved({documents:[d],query:'CONTRACT-2026-A',model:'local-embed',check:()=>{}});assert.equal(r.matches[0].source.id,'contract');assert.deepEqual(r.matches[0].retrieval,['lexical']);assert.match(r.method,/reciprocal rank fusion/);});
test('a long repetitive source cannot hide another matching source in bounded hybrid results',async()=>{const docs=[doc('long','预算分析相关内容。'.repeat(1600)),doc('short','第二份独立资料')],store={data:{settings:{localEmbeddingModel:'local-embed'},documents:docs},save:async()=>{}};const service=createVectorIndex({store,identity:async()=> 'a'.repeat(64),embedder:async(_m,rows)=>rows.map(()=>[1,0,0])});const r=await service.searchApproved({documents:docs,query:'不相关的语义询问',model:'local-embed',check:()=>{}});assert.ok(r.matches.some(m=>m.source.id==='long'));assert.ok(r.matches.some(m=>m.source.id==='short'));assert.ok(r.matches.length<=8);assert.ok(r.matches.every(m=>m.endOffset-m.offset===m.text.length));});
test('corrupt cached vector dimensions cannot poison dimension during rebuild',async()=>{
 const d=doc('long','新能源汽车预算分析。'.repeat(400));
 const store={data:{settings:{localEmbeddingModel:'local-embed'},documents:[d]},save:async()=>{}};
 const good=async(_m,rows)=>rows.map(()=>[1,0,0]);
 const service=createVectorIndex({store,identity:async()=> 'a'.repeat(64),embedder:good});
 const opts={documents:[d],query:'预算',model:'local-embed',check:()=>{}};
 await service.searchApproved(opts);
 const e=store.data.knowledgeVectorIndexes[0];assert.ok(e.vectors.length>1);
 e.vectors[0]=[1,0];e.vectors[1]=[0,0];
 e.checksum=createHash('sha256').update(JSON.stringify([e.model,e.modelDigest,e.id,e.revision,e.sha256,e.textSha,e.chunks,e.vectors])).digest('hex');
 const r=await service.searchApproved(opts);assert.equal(r.index.built,1);assert.equal(r.index.dimension,3);assert.ok(r.matches.length);
});
test('local model stream cancellation stays bounded even if read and cancel both stall',{timeout:4000},async()=>{
 const {readLocalModelResponse}=await import('../services/knowledge-vector.mjs'),c=new AbortController();let cancel=0;
 const r=new Response(new ReadableStream({start(){},cancel(){cancel++;return new Promise(()=>{});}}));
 const p=readLocalModelResponse(r,{signal:c.signal,maxBytes:100,missing:'empty',tooLarge:'large',invalid:'invalid'});setTimeout(()=>c.abort(Error('stop vector')),20);
 await assert.rejects(p,/stop vector/);assert.equal(cancel,1);
});
test('local model response enforces byte limit and UTF-8 JSON validity',async()=>{
 const {readLocalModelResponse}=await import('../services/knowledge-vector.mjs'),opts={maxBytes:8,missing:'empty',tooLarge:'large',invalid:'invalid'};
 await assert.rejects(readLocalModelResponse(new Response('123456789'),opts),/large/);
 await assert.rejects(readLocalModelResponse(new Response(Uint8Array.from([0xff])),opts),/invalid/);
 assert.deepEqual(await readLocalModelResponse(new Response('{"a":1}'),opts),{a:1});
});
test('real local HTTP embedding response cancellation never persists partial vectors',{timeout:5000},async()=>{
 const {createServer}=await import('node:http'),ctrl=new AbortController();let requested=0;
 const server=createServer(async(req,res)=>{res.setHeader('content-type','application/json');if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'local-embed',digest:'a'.repeat(64)}]}));return;}for await(const _ of req){}requested++;res.write('{"embeddings":[');setTimeout(()=>ctrl.abort(Error('stop embed')),20);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(11434,'127.0.0.1',resolve);});
 try{const f=fixture();let saves=0;f.store.save=async()=>{saves++};const service=createVectorIndex({store:f.store});await assert.rejects(service.searchApproved({documents:f.docs,query:'预算',model:'local-embed',check:()=>{},signal:ctrl.signal}),/stop embed/);assert.equal(requested,1);assert.equal(saves,0);assert.equal(f.store.data.knowledgeVectorIndexes,undefined);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
