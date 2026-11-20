// Serializes access to one derived store. Waiting jobs are removable before
// they begin, and cancellation never releases an already running job early.
export function createSerialJobs({maxWaiting=20,fullMessage='等待队列已满'}={}){
 if(!Number.isInteger(maxWaiting)||maxWaiting<1||maxWaiting>100||typeof fullMessage!=='string'||!fullMessage)throw Error('串行队列配置无效');
 const waiters=[];let running=false;
 function pump(){
  if(running||!waiters.length)return;
  const job=waiters.shift();job.cleanup();running=true;
  Promise.resolve().then(()=>{job.signal?.throwIfAborted();return job.action();})
   .then(job.resolve,job.reject).finally(()=>{running=false;pump();});
 }
 return function enqueue(action,signal){
  if(typeof action!=='function')return Promise.reject(Error('串行任务无效'));
  if(signal?.aborted)return Promise.reject(signal.reason||Error('已取消'));
  if(waiters.length>=maxWaiting)return Promise.reject(Error(fullMessage));
  return new Promise((resolve,reject)=>{
   const job={action,signal,resolve,reject};
   const abort=()=>{const i=waiters.indexOf(job);if(i<0)return;waiters.splice(i,1);job.cleanup();reject(signal.reason||Error('已取消'));};
   job.cleanup=()=>signal?.removeEventListener('abort',abort);
   waiters.push(job);signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted)abort();else pump();
  });
 };
}
