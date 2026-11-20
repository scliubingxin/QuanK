import {createHash} from 'node:crypto';
import {LOCAL_ONNX_MODEL} from '../runtime/local-onnx-embedding.mjs';
import {createSerialJobs} from '../runtime/serial-jobs.mjs';
import {knowledgeChunks,knowledgeQuery,validateKnowledgeDocuments,boundKnowledgeResult,searchKnowledge} from '../runtime/knowledge-search.mjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
const sessions=new WeakMap(),localFactories=new WeakMap();
// Host configures a trusted fixed asset root; renderer never supplies executable paths.
export function configureLocalOnnx(store,factory){if(typeof factory!=='function')throw Error('本机嵌入运行配置无效');localFactories.set(store,factory);}
export function sharedVectorIndex(store){if(!sessions.has(store)){const route=async(model,method,args)=>{if(model!==LOCAL_ONNX_MODEL)return method==='identity'?modelIdentity(...args):embed(...args);const factory=localFactories.get(store);if(!factory)throw Error('此版本未内置本机ONNX嵌入模型');const engine=await factory();return engine[method](...args);};sessions.set(store,createVectorIndex({store,identity:(model,signal)=>route(model,'identity',[model,signal]),embedder:(model,texts,signal)=>route(model,'embed',[model,texts,signal])}));}return sessions.get(store);}
export function validateEmbeddingModel(value){if(typeof value!=='string'||value.includes('://')||value.includes('..')||! /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(value))throw Error('本机嵌入模型名称无效');return value;}
export function embeddingModelDigest(rows,model){
 const matches=Array.isArray(rows)?rows.filter(x=>x&&typeof x==='object'&&(x.name===model||x.model===model)):[];
 if(!matches.length||matches.some(x=>typeof x.digest!=='string'||! /^[a-f0-9]{64}$/.test(x.digest)))throw Error('本机嵌入模型不存在或无法确认摘要');
 if(matches.some(x=>x.digest!==matches[0].digest))throw Error('本机嵌入模型目录存在冲突摘要');
 return matches[0].digest;
}
// Bound response bytes and cancellation even if a body stream ignores its fetch signal.
// Cancellation of the underlying stream is best-effort; late chunks are discarded.
export async function readLocalModelResponse(response,{signal,maxBytes,missing,tooLarge,invalid}){
 const reader=response.body?.getReader();if(!reader)throw Error(missing);let pieces=[],size=0,done=false;
 async function read(){signal?.throwIfAborted();let onAbort;const aborted=signal?new Promise((_,reject)=>{onAbort=()=>reject(signal.reason||Error('已取消'));signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();}):null;
  try{const r=await (aborted?Promise.race([reader.read(),aborted]):reader.read());signal?.throwIfAborted();return r;}finally{if(onAbort)signal.removeEventListener('abort',onAbort);}}
 try{while(true){const r=await read();if(r.done){done=true;break;}size+=r.value.byteLength;if(size>maxBytes)throw Error(tooLarge);pieces.push(r.value);}signal?.throwIfAborted();try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(pieces.map(c=>Buffer.from(c)))));}catch{throw Error(invalid);}}
 finally{if(!done){let timer;try{await Promise.race([reader.cancel(),new Promise(resolve=>{timer=setTimeout(resolve,1000);})]);}catch{}finally{clearTimeout(timer);}}reader.releaseLock();}
}
async function embed(model,texts,signal){
 const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000);
 const r=await fetch('http://127.0.0.1:11434/api/embed',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,input:texts,truncate:false}),signal:deadline});
 if(!r.ok)throw Error('本机嵌入服务返回 HTTP '+r.status);
 const response=await readLocalModelResponse(r,{signal:deadline,maxBytes:4*1024*1024,missing:'本机嵌入服务无响应正文',tooLarge:'嵌入响应超限',invalid:'嵌入响应不是有效 JSON'});return response.embeddings;
}
async function modelIdentity(model,signal){
 const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000);
 const r=await fetch('http://127.0.0.1:11434/api/tags',{redirect:'error',signal:deadline});if(!r.ok)throw Error('无法确认本机嵌入模型版本');
 const response=await readLocalModelResponse(r,{signal:deadline,maxBytes:1048576,missing:'本机模型目录无响应',tooLarge:'本机模型目录超限',invalid:'本机模型目录无效'});return embeddingModelDigest(response.models,model);
}
function normalized(v,dimension){if(!Array.isArray(v)||v.length<2||v.length>2048||(dimension&&v.length!==dimension)||v.some(x=>typeof x!=='number'||!Number.isFinite(x)))throw Error('嵌入向量无效或维度不一致');const n=Math.sqrt(v.reduce((a,x)=>a+x*x,0));if(!Number.isFinite(n)||n<1e-12)throw Error('嵌入向量为空');return v.map(x=>x/n);}
export function createVectorIndex({store,embedder=embed,identity=modelIdentity}){
 const enqueue=createSerialJobs({fullMessage:'本机向量检索等待队列已满'});
 async function work({documents,query,model,signal,check}){
  validateKnowledgeDocuments(documents);knowledgeQuery(query);validateEmbeddingModel(model);if(typeof check!=='function')throw Error('缺少授权来源校验');
  const guard=()=>{signal?.throwIfAborted();check();if(store.data.settings?.localEmbeddingModel!==model)throw Error('嵌入模型配置已改变');for(const d of documents)if(!(store.data.documents||[]).some(x=>x.id===d.id&&x.revision===d.revision&&x.sha256===d.sha256))throw Error('知识来源已变化');};
  guard();const modelDigest=await identity(model,signal);guard();if(!/^[a-f0-9]{64}$/.test(modelDigest))throw Error("本机模型摘要无效");const original=store.data.knowledgeVectorIndexes;let entries=Array.isArray(original)?original.filter(e=>e&&e.version===1&&e.model===model&&e.modelDigest===modelDigest&&(store.data.documents||[]).some(d=>d.id===e.id&&d.revision===e.revision&&d.sha256===e.sha256)):[];
  const sources=[],candidates=[];let dimension=0,built=0,reused=0;
  for(const d of documents){guard();const chunks=knowledgeChunks(d.text,signal),textSha=digest(d.text),old=entries.find(e=>e.id===d.id&&e.textSha===textSha&&e.checksum===digest(JSON.stringify([e.model,e.modelDigest,e.id,e.revision,e.sha256,e.textSha,e.chunks,e.vectors])));let vectors;
   if(old&&JSON.stringify(old.chunks)===JSON.stringify(chunks)&&Array.isArray(old.vectors)&&old.vectors.length===chunks.length){try{const cached=[];let cachedDimension=dimension;for(const v of old.vectors){const n=normalized(v,cachedDimension);cachedDimension=n.length;cached.push(n);}vectors=cached;dimension=cachedDimension;reused++;}catch{vectors=null;}}
   if(!vectors){vectors=[];for(let i=0;i<chunks.length;i+=8){guard();const batch=chunks.slice(i,i+8).map(c=>d.text.slice(c.offset,c.endOffset));const out=await embedder(model,batch,signal);guard();if(!Array.isArray(out)||out.length!==batch.length)throw Error('嵌入响应数量不一致');for(const v of out){const norm=normalized(v,dimension);dimension=norm.length;vectors.push(norm);}}const e={version:1,model,modelDigest,id:d.id,revision:d.revision,sha256:d.sha256,textSha,chunks,vectors};e.checksum=digest(JSON.stringify([e.model,e.modelDigest,e.id,e.revision,e.sha256,e.textSha,e.chunks,e.vectors]));entries=entries.filter(x=>x.id!==d.id);entries.unshift(e);built++;}
   sources.push({id:d.id,name:d.name,revision:d.revision,sha256:d.sha256,characters:d.text.length,chunks:chunks.length,sourceTruncated:d.truncated===true||d.hasRichSource===true});candidates.push({d,chunks,vectors});
  }
  guard();const qv=await embedder(model,[query],signal);guard();if(!Array.isArray(qv)||qv.length!==1)throw Error('查询向量响应数量不一致');const q=normalized(qv[0],dimension);if(await identity(model,signal)!==modelDigest)throw Error("本机嵌入模型在检索期间发生变化");guard();while(entries.length>16||Buffer.byteLength(JSON.stringify(entries))>8*1024*1024)entries.pop();
  if(JSON.stringify(original||[])!==JSON.stringify(entries)){store.data.knowledgeVectorIndexes=entries;let saved=false;try{await store.save();saved=true;guard();if(await identity(model,signal)!==modelDigest)throw Error('本机嵌入模型在保存索引期间发生变化');guard();}catch(e){store.data.knowledgeVectorIndexes=original;if(saved){try{await store.save();}catch{throw Error('向量索引回滚失败，未返回检索结果');}}throw e;}}
  guard();const ranked=[];for(const c of candidates)for(let i=0;i<c.chunks.length;i++){const score=c.vectors[i].reduce((n,x,j)=>n+x*q[j],0);if(score>0.15){const part=c.chunks[i];ranked.push({source:{id:c.d.id,name:c.d.name,revision:c.d.revision,sha256:c.d.sha256},...part,text:c.d.text.slice(part.offset,part.endOffset),score,matchedTerms:[]});}}
  // Reciprocal rank fusion combines semantic and exact lexical evidence without
  // pretending their raw scores share a scale. Both operate on the same approved text.
  ranked.sort((a,b)=>b.score-a.score);const lexical=searchKnowledge(documents,query,signal),combined=new Map();
  for(const [list,kind] of [[ranked,'semantic'],[lexical.matches,'lexical']])list.forEach((c,i)=>{const key=JSON.stringify([c.source.id,c.offset,c.endOffset]);let row=combined.get(key);if(!row){row={...c,score:0,retrieval:[]};combined.set(key,row);}row.score+=1/(60+i+1);row.retrieval.push(kind);});
  guard();const fused=[...combined.values()].sort((a,b)=>b.score-a.score),matches=[],covered=new Set();
  // Ensure a long source cannot crowd every other matching source out of the
  // bounded observation. We still return only approved original text/coordinates.
  for(const c of fused)if(!covered.has(c.source.id)){matches.push(c);covered.add(c.source.id);if(matches.length>=8)break;}
  for(const c of fused){if(matches.length>=8)break;if(!matches.some(x=>x.source.id===c.source.id&&x.offset<c.endOffset&&c.offset<x.endOffset))matches.push(c);}
  matches.sort((a,b)=>b.score-a.score);return boundKnowledgeResult({status:'succeeded',method:'local embedding cosine and lexical reciprocal rank fusion; model '+model,sources,matches,index:{kind:'local-embedding-hybrid',built,reused,dimension},truncated:sources.some(s=>s.sourceTruncated),resultLimited:fused.length>matches.length||lexical.resultLimited,limits:{documents:8,charactersPerSource:100000,matches:8,excerptCharacters:8000,serializedCharacters:30000}});
 }
 return {searchApproved(args){return enqueue(()=>work(args),args?.signal);},clear(){return enqueue(async()=>{const old=store.data.knowledgeVectorIndexes;delete store.data.knowledgeVectorIndexes;try{await store.save();}catch(e){store.data.knowledgeVectorIndexes=old;throw e;}});}};
}
