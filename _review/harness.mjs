// usage: node harness.mjs file.pptx out-prefix  -> renders baseline-style and hi-dpi snapshots
import {startOfficeKit} from '../desktop/runtime/office-kit.mjs';
import {mkdtemp,copyFile,mkdir,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const R='/Applications/WillBuddy.app/Contents/Resources/runtimes';
const dir=await mkdtemp(path.join(os.tmpdir(),'wb-render-'));await copyFile(process.argv[2],path.join(dir,'document.pptx'));
const k=await startOfficeKit({python:R+'/python/bin/python3',officeDirectory:R+'/LibreOffice.app/Contents/MacOS',directory:dir,format:'pptx'});
const jobs=JSON.parse(process.argv[4]||'[]');
for(const [name,req] of jobs){const t=Date.now();const out=await k.request('snapshot',req);await writeFile(process.argv[3]+name+'.png',Buffer.from(out.png,'base64'));console.log(name,out.width,out.height,out.documentWidth,out.documentHeight,Date.now()-t+'ms',out.png.length);}
k.close();
