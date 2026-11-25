/** Host-only experimental BGE adapter. Assets must be assembled and verified at build time. */
import {spawn} from 'node:child_process';
import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {embedLongTexts} from './long-embedding.mjs';
export const LOCAL_ONNX_MODEL='wb-bge-small-zh-v1.5';
const MODEL=LOCAL_ONNX_MODEL;
const MODEL_SHA='1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38';
const TOKENIZER_SHA='48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26';
const ENGINE_ID=createHash('sha256').update('bge-cls-cpu-long-v4:'+MODEL_SHA+':'+TOKENIZER_SHA).digest('hex');
// Passed directly to the isolated bundled Python. No shell, inherited user site,
// dynamic executable or caller-provided code is permitted.
const PYTHON=String.raw`import hashlib,json,os,sys
root=sys.argv[1]
model=os.path.join(root,'model_optimized.onnx');tokenizer_path=os.path.join(root,'tokenizer.json')
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  while True:
   b=f.read(1048576)
   if not b:break
   h.update(b)
 return h.hexdigest()
def verify():
 if sha(model)!='${MODEL_SHA}' or sha(tokenizer_path)!='${TOKENIZER_SHA}':raise RuntimeError('model integrity failed')
verify()
raw=sys.stdin.buffer.read(160001)
if len(raw)>160000:raise ValueError('request exceeds limit')
request=json.loads(raw);items=request.get('input')
if not isinstance(items,list) or not 1<=len(items)<=8 or any(not isinstance(s,str) or not s or len(s)>10000 for s in items):raise ValueError('input invalid')
import numpy as np,onnxruntime as ort
from tokenizers import Tokenizer
tok=Tokenizer.from_file(tokenizer_path);tok.enable_padding();enc=tok.encode_batch(items)
if any(len(e.ids)>512 for e in enc):
 print(json.dumps({'error':'token_limit'}),flush=True);sys.exit(0)
opt=ort.SessionOptions();opt.intra_op_num_threads=1;opt.inter_op_num_threads=1
session=ort.InferenceSession(model,sess_options=opt,providers=['CPUExecutionProvider'])
batch={'input_ids':np.asarray([e.ids for e in enc],dtype='int64'),'attention_mask':np.asarray([e.attention_mask for e in enc],dtype='int64'),'token_type_ids':np.asarray([e.type_ids for e in enc],dtype='int64')}
if {i.name for i in session.get_inputs()}!=set(batch):raise ValueError('unexpected model inputs')
out=session.run(None,batch)[0]
if len(out.shape)!=3 or out.shape[0]!=len(items) or out.shape[2]!=512:raise ValueError('unexpected model output')
vectors=out[:,0,:];norm=np.linalg.norm(vectors,axis=1,keepdims=True)
if not np.isfinite(vectors).all() or not np.isfinite(norm).all() or np.any(norm<1e-12):raise ValueError('invalid vector')
verify();print(json.dumps({'embeddings':(vectors/norm).tolist()},separators=(',',':')),flush=True)`;
// Keep verification bounded even if a model file grows while it is read.
// Before/after descriptor metadata also rejects normal in-place replacements.
export async function hashVerifiedModelHandle(f,size,signal){
 if(!Number.isSafeInteger(size)||size<1)throw Error('本机嵌入模型文件大小无效');
 const before=await f.stat({bigint:true});
 if(!before.isFile()||before.size!==BigInt(size))throw Error('本机嵌入模型文件大小无效');
 const h=createHash('sha256');let count=0;
 for await(const chunk of f.createReadStream({signal,autoClose:false,start:0,end:size-1})){
  signal?.throwIfAborted();count+=chunk.length;h.update(chunk);
 }
 if(count!==size)throw Error('本机嵌入模型读取不完整');
 signal?.throwIfAborted();const after=await f.stat({bigint:true});
 if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||
    before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs)
  throw Error('本机嵌入模型读取期间发生变化');
 return h.digest('hex');
}
async function hashFile(file,size,signal){const f=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{return await hashVerifiedModelHandle(f,size,signal);}finally{await f.close();}}
export function createLocalOnnxEmbedding({python,modelDirectory,timeoutMs=30000}){
 if(!path.isAbsolute(python||'')||!path.isAbsolute(modelDirectory||'')||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw Error('本机嵌入运行路径无效');
 async function identity(model,signal){signal?.throwIfAborted();if(model!==MODEL)throw Error('内置嵌入模型名称无效');let m,t;try{[m,t]=await Promise.all([hashFile(path.join(modelDirectory,'model_optimized.onnx'),94781076,signal),hashFile(path.join(modelDirectory,'tokenizer.json'),439125,signal)]);}catch(e){if(e.code==='ENOENT')throw Error('此版本未安装本机ONNX模型文件');throw e;}if(m!==MODEL_SHA||t!==TOKENIZER_SHA)throw Error('本机嵌入模型文件校验失败');return ENGINE_ID;}
 async function embedBatch(model,texts,signal){await identity(model,signal);signal?.throwIfAborted();if(!Array.isArray(texts)||texts.length<1||texts.length>8||texts.some(t=>typeof t!=='string'||!t||t.length>10000))throw Error('嵌入文本超限');const payload=JSON.stringify({input:texts});if(Buffer.byteLength(payload)>160000)throw Error('嵌入请求超限');
  return new Promise((resolve,reject)=>{let out=[],bytes=0,done=false,timer;const child=spawn(python,['-I','-B','-c',PYTHON,modelDirectory],{shell:false,stdio:['pipe','pipe','ignore'],env:{PATH:'/usr/bin:/bin',PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1'}});
   const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error){child.kill('SIGKILL');reject(error);}else resolve(value);};
   const abort=()=>finish(signal?.reason||Error('嵌入任务已取消'));timer=setTimeout(()=>finish(Error('本机嵌入执行超时')),timeoutMs);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   child.on('error',()=>finish(Error('本机嵌入运行时不可用')));child.stdin.on('error',()=>{});child.stdout.on('error',()=>finish(Error('本机嵌入响应读取失败')));child.stdout.on('data',b=>{bytes+=b.length;if(bytes>1024*1024)finish(Error('嵌入响应超限'));else out.push(b);});child.on('close',code=>{if(done)return;if(code!==0)return finish(Error('本机嵌入运行失败或模型校验失败'));try{const parsed=JSON.parse(Buffer.concat(out).toString('utf8'));if(parsed?.error==='token_limit'){const e=Error('本机嵌入文本超过512个分词');e.code='WB_EMBED_TOKEN_LIMIT';return finish(e);}const result=parsed.embeddings;if(!Array.isArray(result)||result.length!==texts.length||result.some(v=>!Array.isArray(v)||v.length!==512||v.some(x=>typeof x!=='number'||!Number.isFinite(x))))throw Error();finish(null,result);}catch{finish(Error('本机嵌入结果无效'));}});if(!done)child.stdin.end(payload);
  });
 }
 async function embed(model,texts,signal){
  if(!Array.isArray(texts)||texts.length<1||texts.length>8||texts.some(t=>typeof t!=='string'||!t||t.length>10000))throw Error('嵌入文本超限');
  const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
  return embedLongTexts(texts,(batch,s)=>embedBatch(model,batch,s),deadline);
 }
 return {model:MODEL,identity,embed};
}
