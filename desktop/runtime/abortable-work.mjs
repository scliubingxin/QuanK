// Stop waiting when an adapter ignores AbortSignal. The underlying operation
// may continue; callers must guard before any subsequent side effect.
export async function abortableWork(work,signal){
 signal?.throwIfAborted();
 if(!signal)return work();
 let onAbort;
 const stopped=new Promise((_,reject)=>{onAbort=()=>reject(signal.reason||Error('已取消'));signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();});
 try{return await Promise.race([Promise.resolve().then(()=>{signal.throwIfAborted();return work();}),stopped]);}
 finally{signal.removeEventListener('abort',onAbort);}
}
