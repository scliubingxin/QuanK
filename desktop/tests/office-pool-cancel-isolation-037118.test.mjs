import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createOfficePreviewPool} from '../runtime/office-preview-pool.mjs';
import {generateDocument} from '../runtime/documents.mjs';
import {officeDirectory,officePython} from './helpers/office-kit-runtime.mjs';

test('cancelling one real Office preview does not stop a separate preview', {timeout:60000}, async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'wb-cancel-isolation-'));
  const pool=createOfficePreviewPool({runtime:async()=>({python:officePython,officeDirectory}),directory:path.join(directory,'pool'),capacity:2});
  try {
    const first=(await generateDocument('docx',JSON.stringify({blocks:[{type:'paragraph',text:'ALPHA CANCELLED 8491'}]}))).bytes;
    const second=(await generateDocument('docx',JSON.stringify({blocks:[{type:'paragraph',text:'BETA COMPLETED 6732'}]}))).bytes;
    await pool.preview({format:'docx',bytes:first});
    const controller=new AbortController();
    const cancelled=pool.preview({format:'docx',bytes:first},controller.signal);
    const survivor=pool.preview({format:'docx',bytes:second});
    controller.abort(Error('cancel one preview'));
    await assert.rejects(cancelled,/cancel one preview/);
    const result=await survivor, file=path.join(directory,'survivor.pdf');
    await writeFile(file,result);
    const contents=execFileSync('pdftotext',[file,'-'],{timeout:10000}).toString();
    assert.match(contents,/BETA COMPLETED 6732/);
    assert.doesNotMatch(contents,/ALPHA CANCELLED 8491/);
  } finally {await pool.close();await rm(directory,{recursive:true,force:true});}
});
