import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRunQueue} from '../runtime/run-queue.mjs';

test('queued cancellation with failed persistence reports interruption and never starts work',async()=>{
 let rejectWrites=false,calls=0;
 const store={data:{runJobs:[]},save:async()=>{if(rejectWrites)throw Error('disk full');}};
 const active=new Map([['occupied',new AbortController()]]),queue=createRunQueue({store,active,capacity:1});
 const done=queue.submit({id:'job',kind:'conversation',ownerId:'owner',fingerprint:'f'},async()=>{calls++;});
 while(queue.lookup('job')?.status!=='queued')await new Promise(r=>setImmediate(r));
 await new Promise(r=>setImmediate(r));rejectWrites=true;
 await assert.rejects(queue.cancel('job'),/disk full/);
 const result=await done;
 assert.equal(result.status,'interrupted');
 assert.match(result.persistenceError,/disk full/);
 assert.equal(calls,0);
 assert.equal(queue.hasPending(),false);
});

test('a transient cancellation write failure persists interrupted rather than a false success',async()=>{
 let failNext=false,durable,calls=0;
 const store={data:{runJobs:[]},save:async()=>{if(failNext){failNext=false;throw Error('write failed');}durable=structuredClone(store.data);}};
 const active=new Map([['occupied',new AbortController()]]),queue=createRunQueue({store,active,capacity:1});
 const done=queue.submit({id:'job',kind:'conversation',ownerId:'owner',fingerprint:'f'},async()=>{calls++;});
 while(queue.lookup('job')?.status!=='queued')await new Promise(r=>setImmediate(r));
 await new Promise(r=>setImmediate(r));failNext=true;
 await assert.rejects(queue.cancel('job'),/write failed/);
 assert.equal((await done).status,'interrupted');
 assert.equal(durable.runJobs[0].status,'interrupted');
 assert.match(durable.runJobs[0].persistenceError,/write failed/);
 assert.equal(calls,0);
});

test('cancellation notification failure is persisted as interrupted and can be retried with a new ID',async()=>{
 let durable,calls=0;
 const store={data:{runJobs:[]},save:async()=>{durable=structuredClone(store.data);}};
 const active=new Map([['occupied',new AbortController()]]),queue=createRunQueue({store,active,capacity:1});
 const done=queue.submit({id:'first',kind:'conversation',ownerId:'owner',fingerprint:'f'},async()=>{calls++;},async job=>{if(job.status==='cancelled')throw Error('notification failed');});
 while(queue.lookup('first')?.status!=='queued')await new Promise(r=>setImmediate(r));
 await new Promise(r=>setImmediate(r));
 await assert.rejects(queue.cancel('first'),/notification failed/);
 assert.equal((await done).status,'interrupted');
 assert.equal(durable.runJobs[0].status,'interrupted');
 assert.match(durable.runJobs[0].persistenceError,/notification failed/);
 const retry=queue.submit({id:'retry',kind:'conversation',ownerId:'owner',fingerprint:'f'},async()=>{calls++;return {status:'completed'};});
 active.clear();await queue.pump();assert.equal((await retry).status,'completed');assert.equal(calls,1);
});
