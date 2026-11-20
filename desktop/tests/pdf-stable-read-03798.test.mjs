import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,open,writeFile,rm,utimes,rename,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readGrantedPdf,readStablePdfHandle,verifyOpenedPdfPath} from '../runtime/pdf-ocr.mjs';

test('same-length in-place PDF modification during read fails closed',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-pdf-stable-')),file=path.join(dir,'scan.pdf');
 try{
  await writeFile(file,'%PDF-old-content');const handle=await open(file,'r');
  try{
   let modified=false;
   const controlled={stat:opts=>handle.stat(opts),read:async(...args)=>{
    const result=await handle.read(...args);
    if(!modified&&result.bytesRead){modified=true;await writeFile(file,'%PDF-new-content');await utimes(file,new Date('2020-01-01'),new Date('2020-01-01'));}
    return result;
   }};
   await assert.rejects(readStablePdfHandle(controlled),/读取期间发生变化/);
   assert.equal(modified,true);
  }finally{await handle.close();}
  const result=await readGrantedPdf([{id:'f',path:dir}],{folderId:'f',relative:'scan.pdf'});
  assert.equal(result.bytes.toString(),'%PDF-new-content');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('small PDF reads allocate according to its size and reject growth during the read',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-pdf-sized-')),file=path.join(dir,'small.pdf');
 try{
  await writeFile(file,'%PDF-small');const handle=await open(file,'r');
  try{
   let largest=0;
   const sized={stat:opts=>handle.stat(opts),read:(buffer,...args)=>{largest=Math.max(largest,buffer.length);return handle.read(buffer,...args);}};
   assert.equal((await readStablePdfHandle(sized)).toString(),'%PDF-small');
   assert.equal(largest,Buffer.byteLength('%PDF-small')+1);
  }finally{await handle.close();}
  const next=await open(file,'r');
  try{
   let grown=false;
   const changing={stat:opts=>next.stat(opts),read:async(...args)=>{
    const value=await next.read(...args);
    if(!grown&&value.bytesRead){grown=true;await writeFile(file,'%PDF-small-and-longer');}
    return value;
   }};
   await assert.rejects(readStablePdfHandle(changing),/变化/);
  }finally{await next.close();}
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('stable reader rejects non-PDF and over-limit input',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-pdf-invalid-')),file=path.join(dir,'bad.pdf');
 try{
  await writeFile(file,'not a PDF');
  await assert.rejects(readGrantedPdf([{id:'f',path:dir}],{folderId:'f',relative:'bad.pdf'}),/内容无效/);
  await writeFile(file,Buffer.alloc(16*1024*1024+1,0x20));
  await assert.rejects(readGrantedPdf([{id:'f',path:dir}],{folderId:'f',relative:'bad.pdf'}),/超过16MiB/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('opened PDF cannot silently refer to a replaced path, even with identical bytes',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-pdf-path-')),file=path.join(dir,'scan.pdf');
 try{
  await writeFile(file,'%PDF-example');const handle=await open(file,'r');
  try{
   assert.equal((await readStablePdfHandle(handle)).toString(),'%PDF-example');
   await verifyOpenedPdfPath(file,handle);
   await rename(file,path.join(dir,'original.pdf'));
   await writeFile(file,'%PDF-example');
   await assert.rejects(verifyOpenedPdfPath(file,handle),/路径或文件已变化/);
   await rm(file);await symlink(path.join(dir,'original.pdf'),file);
   await assert.rejects(verifyOpenedPdfPath(file,handle),/路径或文件已变化/);
  }finally{await handle.close();}
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('authorized PDF read fails if its directory entry is replaced during reading',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wb-pdf-read-race-')),file=path.join(dir,'scan.pdf');
 await writeFile(file,'%PDF-source');
 const probe=await open(file,'r'),prototype=Object.getPrototypeOf(probe),original=prototype.read;
 const inode=(await probe.stat()).ino;await probe.close();let changed=false;
 prototype.read=async function(...args){
  const out=await original.apply(this,args);
  if(!changed&&out.bytesRead&&(await this.stat()).ino===inode){
   changed=true;await rename(file,path.join(dir,'old.pdf'));await writeFile(file,'%PDF-source');
  }
  return out;
 };
 try{
  await assert.rejects(readGrantedPdf([{id:'f',path:dir}],{folderId:'f',relative:'scan.pdf'}),/发生变化|路径或文件已变化/);
  assert.equal(changed,true);
 }finally{prototype.read=original;await rm(dir,{recursive:true,force:true});}
});

