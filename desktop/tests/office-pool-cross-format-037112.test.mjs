import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createOfficePreviewPool} from '../runtime/office-preview-pool.mjs';
import {generateDocument} from '../runtime/documents.mjs';
import {officeDirectory,officePython} from './helpers/office-kit-runtime.mjs';

test('real pooled LibreOfficeKit alternates Word, Excel and PowerPoint without crossing text',{timeout:60000},async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'wb-cross-format-'));
 const pool=createOfficePreviewPool({runtime:async()=>({python:officePython,officeDirectory}),directory:path.join(directory,'pool'),capacity:2});
 const specs=[
  ['docx',{title:'WORD PRIVATE ALPHA 7329',blocks:[{type:'paragraph',text:'Alpha narrative'},{type:'table',rows:[['Item','Amount'],['Paper','19']]}]},'WORD PRIVATE ALPHA 7329'],
  ['xlsx',{sheets:[{name:'Budget',rows:[['EXCEL PRIVATE BETA 5413'],['Amount',31]]}]},'EXCEL PRIVATE BETA 5413'],
  ['pptx',{slides:[{title:'SLIDE PRIVATE GAMMA 8624',bullets:['Separate presentation']}]},'SLIDE PRIVATE GAMMA 8624']
 ];
 try{
  const docs=[];for(const [format,spec,marker] of specs)docs.push({format,marker,bytes:(await generateDocument(format,JSON.stringify(spec))).bytes});
  for(let round=0;round<3;round++){
   const ordered=round===1?[2,0,1]:[0,1,2];
   const results=await Promise.all(ordered.map(i=>pool.preview(docs[i])));
   for(const [position,data] of results.entries()){
    const index=ordered[position],file=path.join(directory,'result-'+round+'-'+position+'.pdf');
    assert.equal(data.subarray(0,5).toString(),'%PDF-');await writeFile(file,data);
    const text=execFileSync('pdftotext',[file,'-'],{timeout:15000}).toString();
    assert.ok(text.includes(docs[index].marker),'missing '+docs[index].marker);
    for(const [other,d] of docs.entries())if(other!==index)assert.ok(!text.includes(d.marker),'cross-document content');
   }
  }
  assert.equal(pool.stats().busy,0);assert.equal(pool.stats().workers,2);
 }finally{await pool.close();await rm(directory,{recursive:true,force:true});}
});
