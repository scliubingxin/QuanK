import {mkdtemp,mkdir,writeFile,lstat,open,rm} from 'node:fs/promises';import {constants} from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {spawn} from 'node:child_process';
import {runCommand,commandEnvironment} from '../runtime/command.mjs';import {inspectDocument,sha256} from '../runtime/documents.mjs';
import {OFFICE_PREVIEW_TIMEOUT_MS} from '../src/shared/office-timeouts.js';
import {exportOfficePdf} from '../runtime/office-pdf.mjs';
import {createOfficePreviewCache} from '../runtime/office-preview-cache.mjs';
import {createOfficePreviewPool} from '../runtime/office-preview-pool.mjs';
const profile='<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Common/Load"><prop oor:name="UpdateDocMode" oor:op="fuse"><value>0</value></prop></item></oor:items>';
async function bounded(file,max){const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>max)throw Error('Office输出非普通文件或超限');const h=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const b=Buffer.alloc(max+1);let n=0;while(n<b.length){const r=await h.read(b,n,b.length-n,null);if(!r.bytesRead)break;n+=r.bytesRead;}if(n>max)throw Error('Office输出读取超限');return b.subarray(0,n);}finally{await h.close();}}
export function createLibreOffice({documents,directory,executable,pdfRuntime,pdfDriver,approve=async()=>false,run=runCommand,launch,notify=()=>{},previewPoolEnabled=false,previewCacheDirectory,allowPreviewDisk,previewIdentity=async()=>({}),waitForEngine=async()=>{},onPreviewTiming=()=>{}}){
 const active=new Set(),edits=new Map(),busy=new Set(),waiting=[];let closed=false;
 // [p2-ux] recent previews are reused while the document revision and bytes are unchanged
 const previewCache=new Map();
 const disk=previewCacheDirectory&&createOfficePreviewCache({directory:previewCacheDirectory,allowed:allowPreviewDisk});
 const remember=(key,out)=>{previewCache.set(key,out);let size=0;for(const v of previewCache.values())size+=v.base64.length;while(previewCache.size>1&&(previewCache.size>8||size>64*1024**2)){const [k,v]=previewCache.entries().next().value;size-=v.base64.length;previewCache.delete(k);}return {...out};};const previewPool=previewPoolEnabled&&pdfRuntime?createOfficePreviewPool({runtime:pdfRuntime,directory}):null;const check=()=>{if(closed)throw Error('Office服务已关闭');};
 async function acquire(signal){check();signal?.throwIfAborted();if(active.size<2){const c=new AbortController();active.add(c);return c;}if(waiting.length>=20)throw Error('Office预览排队已满，请稍后重试');return new Promise((resolve,reject)=>{const entry={resolve,reject,signal};entry.abort=()=>{const i=waiting.indexOf(entry);if(i>=0)waiting.splice(i,1);reject(signal.reason||Error('预览已取消'));};signal?.addEventListener('abort',entry.abort,{once:true});waiting.push(entry);if(signal?.aborted)entry.abort();});}
 function release(c){active.delete(c);while(waiting.length&&!closed){const entry=waiting.shift();entry.signal?.removeEventListener('abort',entry.abort);if(entry.signal?.aborted){entry.reject(entry.signal.reason);continue;}const next=new AbortController();active.add(next);entry.resolve(next);break;}}
 const source=(id,revision)=>{const d=documents.bytes(id,revision);if(!['docx','xlsx','pptx'].includes(d.format))throw Error('仅支持DOCX/XLSX/PPTX');inspectDocument(d.format,d.bytes);return d;};
 const same=(id,d)=>{if(documents.read(id).revision!==d.revision||documents.bytes(id,d.revision).sha256!==d.sha256)throw Error('处理期间原文档已变化');};
 async function stage(d){await mkdir(directory,{recursive:true,mode:0o700});const dir=await mkdtemp(path.join(directory,'office-'));await mkdir(path.join(dir,'profile/user'),{recursive:true,mode:0o700});await writeFile(path.join(dir,'profile/user/registrymodifications.xcu'),profile,{flag:'wx',mode:0o600});await mkdir(path.join(dir,'output'),{mode:0o700});const file=path.join(dir,'document.'+d.format);await writeFile(file,d.bytes,{flag:'wx',mode:0o600});return {dir,file,profile:'-env:UserInstallation='+pathToFileURL(path.join(dir,'profile')).href};}
 return {
warmPreview(){return previewPool?.warm()??Promise.resolve(null);},
 async clearPreviewDisk(){await disk?.clear();},
 async preview(id,revision,signal){
  check();signal?.throwIfAborted();
  const started=performance.now(), d=documents.bytes(id,revision);
  const identity=await previewIdentity().catch(error=>{
   console.warn('[Office] 无法读取预览缓存版本',error.code||error.name);
   return null;
  });
  signal?.throwIfAborted();check();
  const cacheKey=identity&&{sha256:d.sha256,revision,...identity};
  const pkey=cacheKey&&JSON.stringify([id,cacheKey]);
  const hit=pkey&&previewCache.get(pkey);
  if(hit){
   previewCache.delete(pkey);previewCache.set(pkey,hit);
   onPreviewTiming({cache:'memory',conversionMs:0,ms:Math.round(performance.now()-started)});
   return {...hit};
  }
  const result=(bytes,engine)=>({format:'pdf',engine,id,revision,sha256:d.sha256,pdfSha256:sha256(bytes),base64:bytes.toString('base64')});
  const cached=cacheKey&&await disk?.get(cacheKey);
  signal?.throwIfAborted();check();
  if(cached){
   same(id,d);
   onPreviewTiming({cache:'disk',conversionMs:0,ms:Math.round(performance.now()-started)});
   return remember(pkey,result(cached,'LibreOfficeKit cache'));
  }
  const c=await acquire(signal);let staged, conversion;
  try{
   await waitForEngine();
   check();
   const combined=AbortSignal.any([c.signal,AbortSignal.timeout(pdfRuntime ? OFFICE_PREVIEW_TIMEOUT_MS : 60000),...(signal?[signal]:[])]);
   combined.throwIfAborted();
   conversion=performance.now();
   let bytes,engine;
   if(previewPool){
    try{bytes=await previewPool.preview(d,combined,identity?.fontFingerprint);engine='LibreOfficeKit pool';}
    catch(e){if(combined.aborted||closed)throw e;}
   }
   if(!bytes){
    source(id,revision);
    staged=await stage(d);combined.throwIfAborted();
    if(pdfRuntime) await exportOfficePdf({runtime:pdfRuntime,directory:staged.dir,format:d.format,signal:combined,driver:pdfDriver});
    else {
     const exe=await executable(),r=await run({executable:exe,args:[staged.profile,'--headless','--norestore','--nodefault','--nofirststartwizard','--convert-to','pdf','--outdir',path.join(staged.dir,'output'),staged.file],cwd:staged.dir,timeoutMs:60000},{signal:combined,maxBytes:65536});
     if(r.status!=='succeeded')throw Error('Office 文档转换失败：'+r.status+' '+(r.stderr||'').slice(0,300));
    }
    combined.throwIfAborted();check();same(id,d);
    bytes=await bounded(path.join(staged.dir,'output/document.pdf'),16*1024**2);
    engine=pdfRuntime?'LibreOfficeKit':'LibreOffice';
   }
   combined.throwIfAborted();check();same(id,d);
   if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Office 引擎未生成有效PDF');
   const conversionMs=Math.round(performance.now()-conversion);
   if(cacheKey)await disk?.put(cacheKey,bytes).catch(error=>console.warn('[Office] 预览缓存写入失败',error.code||error.name));
   combined.throwIfAborted();check();same(id,d);
   onPreviewTiming({cache:'miss',conversionMs,ms:Math.round(performance.now()-started)});
   const output=result(bytes,engine);
   return pkey?remember(pkey,output):output;
  }catch(error){
   onPreviewTiming({cache:'miss',failed:true,conversionMs:conversion===undefined?0:Math.round(performance.now()-conversion),ms:Math.round(performance.now()-started)});
   throw error;
  }finally{
   try{if(staged)await rm(staged.dir,{recursive:true,force:true});}finally{release(c);}
  }
 },
 async edit(id,revision,signal){check();if(busy.has(id)||edits.has(id))throw Error('此文档已有编辑副本，请先收回');if(edits.size+busy.size>=2)throw Error('最多同时编辑2份文档');busy.add(id);let s;
 try{const d=source(id,revision);if(await approve('使用QuanK Office编辑',d.name+'.'+d.format+'\n启动随应用内置的原生编辑窗口，可插入图片、编辑表格与排版。保存并退出编辑窗口后返回收回新版本；原件不改。宏禁止，程序仍有当前账号权限。',signal)!==true)return {status:'denied'};signal?.throwIfAborted();same(id,d);s=await stage(d);const exe=await executable();check();const args=[s.profile,'--norestore','--nodefault','--nofirststartwizard',s.file];const child=launch?await launch(exe,args,s.dir):await new Promise((resolve,reject)=>{const p=spawn(exe,args,{cwd:s.dir,env:commandEnvironment(),shell:false,detached:process.platform!=='win32',stdio:'ignore'});p.once('error',reject);p.once('spawn',()=>resolve(p));});edits.set(id,{...s,original:d,child});s=null;notify();return {status:'opened',id,revision};}finally{busy.delete(id);if(s)await rm(s.dir,{recursive:true,force:true});}
 },
 async collect(id,signal){check();if(busy.has(id))throw Error('文档正在处理');const s=edits.get(id);if(!s)throw Error('没有本次编辑副本');busy.add(id);
 try{if(s.child?.exitCode===null)throw Error('请先保存并退出编辑窗口再收回');same(id,s.original);const bytes=await bounded(s.file,4*1024**2),info=inspectDocument(s.original.format,bytes);if(info.sha256===s.original.sha256)throw Error('副本尚无变化，请先保存');if(await approve('收回文档编辑结果',s.original.name+'.'+s.original.format+'\n第'+s.original.revision+'→'+(s.original.revision+1)+'版，'+bytes.length+'字节\nSHA-256 '+info.sha256+'\n原件及前版保留。',signal)!==true)return {status:'denied'};signal?.throwIfAborted();same(id,s.original);const again=await bounded(s.file,4*1024**2);if(sha256(again)!==info.sha256)throw Error('审批期间副本变化');const result=await documents.replaceBytes(id,s.original.revision,again,signal,{nativeOffice:true});edits.delete(id);await rm(s.dir,{recursive:true,force:true});notify();return result;}finally{busy.delete(id);}
 },
 sessions(){return [...edits].map(([id,s])=>({id,revision:s.original.revision}));},
 async close(){closed=true;await previewPool?.close();for(const entry of waiting.splice(0)){entry.signal?.removeEventListener('abort',entry.abort);entry.reject(Error('Office服务已关闭'));}for(const c of active)c.abort();for(const s of edits.values()){if(s.child?.pid)try{process.kill(-s.child.pid,'SIGTERM');}catch{try{s.child.kill?.();}catch{}}await rm(s.dir,{recursive:true,force:true});}edits.clear();}
 };
}
