import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {abortableWork} from '../runtime/abortable-work.mjs';

test('already cancelled work never starts; errors and successful values remain intact',async()=>{
 let calls=0;const c=new AbortController();c.abort(Error('stop'));
 await assert.rejects(abortableWork(()=>{calls++;},c.signal),/stop/);
 assert.equal(calls,0);assert.equal(await abortableWork(()=>42),42);
 await assert.rejects(abortableWork(()=>{throw Error('failure');}),/failure/);
});
test('waiting cancellation removes listeners and consumes a late rejection',{timeout:3000},async()=>{
 const c=new AbortController();let rejectLate,entered;
 const ready=new Promise(r=>{entered=r;});
 const operation=abortableWork(()=>{entered();return new Promise((_,reject)=>{rejectLate=reject;});},c.signal);
 await ready;assert.equal(getEventListeners(c.signal,'abort').length,1);
 c.abort(Error('stop waiting'));await assert.rejects(operation,/stop waiting/);
 assert.equal(getEventListeners(c.signal,'abort').length,0);
 rejectLate(Error('late adapter failure'));await new Promise(r=>setImmediate(r));
});
