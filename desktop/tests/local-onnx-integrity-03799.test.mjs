import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,open,writeFile,appendFile,rm,symlink,utimes} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {hashVerifiedModelHandle,createLocalOnnxEmbedding,LOCAL_ONNX_MODEL} from '../runtime/local-onnx-embedding.mjs';

test('model hash stays bounded and rejects a file appended during verification',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-model-integrity-')),file=path.join(dir,'model'),data=Buffer.alloc(2*1024*1024,7);
 try{
  await writeFile(file,data);const f=await open(file,'r');
  try{
   assert.equal(await hashVerifiedModelHandle(f,data.length),createHash('sha256').update(data).digest('hex'));
   let count=0,appended=false;
   const wrapper={stat:opts=>f.stat(opts),createReadStream:opts=>(async function*(){
    for await(const chunk of f.createReadStream(opts)){
     count+=chunk.length;
     if(!appended){appended=true;await appendFile(file,Buffer.alloc(1024*1024,8));}
     yield chunk;
    }
   })()};
   await assert.rejects(hashVerifiedModelHandle(wrapper,data.length),/读取期间发生变化/);
   assert.equal(count,data.length);
  }finally{await f.close();}
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('model verification honors cancellation without accepting a partial digest',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-model-cancel-')),file=path.join(dir,'model'),data=Buffer.alloc(1024*1024,5);
 try{
  await writeFile(file,data);const f=await open(file,'r'),controller=new AbortController();
  try{
   const wrapper={stat:opts=>f.stat(opts),createReadStream:opts=>(async function*(){
    for await(const chunk of f.createReadStream(opts)){controller.abort(Error('model cancelled'));yield chunk;}
   })()};
   await assert.rejects(hashVerifiedModelHandle(wrapper,data.length,controller.signal),/model cancelled|aborted/i);
  }finally{await f.close();}
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('same-length in-place model mutation cannot produce an accepted hash',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-model-change-')),file=path.join(dir,'model'),data=Buffer.alloc(256*1024,1);
 try{
  await writeFile(file,data);const f=await open(file,'r');let changed=false;
  try{
   const wrapper={stat:opts=>f.stat(opts),createReadStream:opts=>(async function*(){
    for await(const chunk of f.createReadStream(opts)){
     if(!changed){changed=true;await writeFile(file,Buffer.alloc(data.length,2));await utimes(file,new Date('2020-01-01'),new Date('2020-01-01'));}
     yield chunk;
    }
   })()};
   await assert.rejects(hashVerifiedModelHandle(wrapper,data.length),/读取期间发生变化/);
   assert.equal(changed,true);
  }finally{await f.close();}
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('model identity rejects symbolic-link assets before launching Python',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-model-link-'));
 try{
  await writeFile(path.join(dir,'target'),'fake');
  await symlink(path.join(dir,'target'),path.join(dir,'model_optimized.onnx'));
  await writeFile(path.join(dir,'tokenizer.json'),'fake');
  const engine=createLocalOnnxEmbedding({python:'/usr/bin/python3',modelDirectory:dir});
  await assert.rejects(engine.identity(LOCAL_ONNX_MODEL));
 }finally{await rm(dir,{recursive:true,force:true});}
});

