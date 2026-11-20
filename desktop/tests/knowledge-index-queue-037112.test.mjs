import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createKnowledgeIndexService} from '../services/knowledge-index.mjs';

function fixture(){
 const text='第一份中文知识资料，包含受控检索和来源。';
 const doc={id:'d',name:'d',revision:1,text,sha256:createHash('sha256').update(text).digest('hex')};
 let release,entered,saves=0;const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
 const store={data:{documents:[doc]},save:async()=>{if(++saves===1){entered();await gate;}}};
 const service=createKnowledgeIndexService({store});
 const opts={documents:[doc],query:'知识资料',check:()=>{}};
 return {service,store,opts,release,started,saves:()=>saves};
}
test('cancelled lexical search waiting behind a save returns without reading or writing',{timeout:3000},async()=>{
 const f=fixture(),first=f.service.searchApproved(f.opts);await f.started;
 let checked=0;const c=new AbortController();
 const pending=f.service.searchApproved({...f.opts,check:()=>{checked++},signal:c.signal});
 c.abort(Error('cancel lexical'));await assert.rejects(pending,/cancel lexical/);
 assert.equal(checked,0);assert.equal(f.saves(),1);
 f.release();assert.equal((await first).status,'succeeded');
 const next=await f.service.searchApproved(f.opts);assert.equal(next.status,'succeeded');
});
test('lexical clear stays ordered after an active save, and a failed job does not block later searches',{timeout:3000},async()=>{
 const f=fixture(),first=f.service.searchApproved(f.opts);await f.started;
 const clear=f.service.clear();f.release();await first;await clear;
 assert.equal(f.store.data.knowledgeIndexes,undefined);
 const bad=f.service.searchApproved({...f.opts,query:''}),good=f.service.searchApproved(f.opts);
 await assert.rejects(bad);assert.equal((await good).status,'succeeded');
});
