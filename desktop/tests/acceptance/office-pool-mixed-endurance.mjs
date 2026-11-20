// Explicit long-running Linux/Mac acceptance: bounded synthetic data only.
// This checks extracted text isolation, not pixel-perfect Office rendering.
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createOfficePreviewPool} from '../../runtime/office-preview-pool.mjs';
import {generateDocument} from '../../runtime/documents.mjs';
import {officeDirectory,officePython} from '../helpers/office-kit-runtime.mjs';

const seconds=Number(process.env.WB_SOAK_SECONDS||'1800');
if(!Number.isInteger(seconds)||seconds<1||seconds>3000)throw Error('invalid duration');
const dir=await mkdtemp(path.join(tmpdir(),'wb-mixed-pool-'));
const pool=createOfficePreviewPool({runtime:async()=>({python:officePython,officeDirectory}),directory:path.join(dir,'pool'),capacity:2});
const started=Date.now(),deadline=started+seconds*1000;let rounds=0,nextLog=started+60000;
const specs=[
 ['docx',{title:'ALPHA UNIQUE 7329',blocks:[{type:'paragraph',text:'Word contents'},{type:'table',rows:[['Item','Amount'],['Alpha','19']]}]},'ALPHA UNIQUE 7329'],
 ['xlsx',{sheets:[{name:'Budget',rows:[['BETA UNIQUE 5413'],['Amount',31]]},{name:'Summary',rows:[['BETA SECOND SHEET']]}]},'BETA UNIQUE 5413'],
 ['pptx',{slides:[{title:'GAMMA UNIQUE 8624',bullets:['Slide contents']},{title:'GAMMA SECOND SLIDE',bullets:['End']}]},'GAMMA UNIQUE 8624']
];
try{
 const docs=[];for(const [format,spec,marker] of specs)docs.push({format,marker,bytes:(await generateDocument(format,JSON.stringify(spec))).bytes});
 while(Date.now()<deadline){
  const order=rounds%2?[2,0,1]:[0,1,2];
  const results=await Promise.all(order.map(i=>pool.preview(docs[i])));
  for(const [position,data] of results.entries()){
   const index=order[position],file=path.join(dir,'result-'+position+'.pdf');await writeFile(file,data);
   const text=execFileSync('pdftotext',[file,'-'],{timeout:15000}).toString();
   if(!text.includes(docs[index].marker)||docs.some((d,i)=>i!==index&&text.includes(d.marker)))throw Error('cross-format content mismatch at round '+rounds+' document '+index);
  }
  rounds++;
  if(Date.now()>=nextLog){console.log(JSON.stringify({rounds,seconds:Math.floor((Date.now()-started)/1000),pool:pool.stats()}));nextLog+=60000;}
 }
 console.log(JSON.stringify({result:'passed',rounds,seconds:Math.floor((Date.now()-started)/1000),engine:'real LibreOfficeKit; synthetic Word, Excel and PowerPoint',pool:pool.stats()}));
}finally{await pool.close();await rm(dir,{recursive:true,force:true});}
