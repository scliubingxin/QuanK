import {open,lstat,mkdir,mkdtemp,writeFile,readFile,rm,realpath,access} from 'node:fs/promises';import {constants} from 'node:fs';import {createHash} from 'node:crypto';import path from 'node:path';import {resolveGranted} from '../core.mjs';import {runCommand} from './command.mjs';import {recognizeImage,bundledOcrEngine} from './image-ocr.mjs';import {imageInfo} from '../src/shared/image-bytes.js';import {pdfRasterWasmAvailable,materializePdfRaster,runPdfRaster} from './pdf-raster-wasm.mjs';import {abortableWork as abortablePdfWork} from './abortable-work.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
// Host authorization checks can wait on filesystem IO. Cancellation ends the
// wait; a late check cannot authorize starting another renderer or OCR child.
export {abortablePdfWork};

async function boundedRead(handle,max,expected=max){if(!Number.isSafeInteger(expected)||expected<0||expected>max)throw Error('文件大小无效');const b=Buffer.alloc(expected+1);let n=0;while(n<b.length){const part=await handle.read(b,n,b.length-n,null);if(!part.bytesRead)break;n+=part.bytesRead;}if(n>expected)throw Error(expected===max?'文件读取超过大小限制':'文件读取期间发生变化');return b.subarray(0,n);}
// A fixed-length read can otherwise combine bytes from two revisions when a
// PDF is edited in place. Compare metadata from the open descriptor on both
// sides of the read; later authorization and SHA checks still remain required.
export async function readStablePdfHandle(handle){
 const before=await handle.stat({bigint:true});
 if(!before.isFile()||before.size<5n||before.size>16777216n)throw Error('PDF文件无效或超过16MiB');
 const bytes=await boundedRead(handle,16*1024*1024,Number(before.size)),after=await handle.stat({bigint:true});
 if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs)throw Error('PDF读取期间发生变化，请重试');
 if(BigInt(bytes.length)!==before.size||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('PDF文件内容无效');
 return bytes;
}
// The descriptor can remain valid after another process replaces the path.
// Reject that case before returning bytes to the OCR pipeline.
export async function verifyOpenedPdfPath(file,handle){
 const [opened,current,resolved]=await Promise.all([handle.stat({bigint:true}),lstat(file,{bigint:true}),realpath(file)]);
 if(!current.isFile()||current.isSymbolicLink()||resolved!==file||
    opened.dev!==current.dev||opened.ino!==current.ino||
    opened.size!==current.size||opened.mtimeNs!==current.mtimeNs||opened.ctimeNs!==current.ctimeNs)
   throw Error('PDF路径或文件已变化，请重新选择');
}
export async function readGrantedPdf(folders,{folderId,relative}){
 if(typeof relative!=='string'||!relative.toLowerCase().endsWith('.pdf'))throw Error('请选择授权目录内的PDF文件');const file=await resolveGranted(folders,folderId,relative),h=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const bytes=await readStablePdfHandle(h);await verifyOpenedPdfPath(file,h);const current=await resolveGranted(folders,folderId,relative);if(current!==file)throw Error('PDF路径或授权已变化，请重新选择');return {folderId,relative,name:path.basename(relative),sha256:digest(bytes),bytes};}finally{await h.close();}
}
export async function bundledPdfOcrTools(resourcesPath=process.resourcesPath){if(!resourcesPath)throw Error('此版本未内置PDF OCR渲染依赖');const engine=await bundledOcrEngine(resourcesPath),root=path.join(resourcesPath,'runtimes','ocr');let pdfinfo,pdftoppm;try{pdfinfo=await realpath(path.join(root,'bin','pdfinfo'));pdftoppm=await realpath(path.join(root,'bin','pdftoppm'));await access(pdfinfo,constants.X_OK);await access(pdftoppm,constants.X_OK);}catch{if(await pdfRasterWasmAvailable())return {...engine,pdfRasterWasm:true};throw Error('此版本未内置PDF OCR渲染依赖');}if(!pdfinfo.startsWith(root+path.sep)||!pdftoppm.startsWith(root+path.sep))throw Error('PDF OCR运行路径无效');return {...engine,pdfinfo,pdftoppm};}
// Keep full text and complete JSON; only bounded positional boxes may be trimmed.
export function boundPdfOcrResult(result){
 const output=result.pages;
 while(JSON.stringify(result).length>40000){let page;for(const item of output)if(item.boxes.length&&(!page||item.boxes.length>=page.boxes.length))page=item;if(!page)throw Error('PDF OCR结果超过完整返回预算');page.boxes.pop();page.boxesTruncated=true;}
 return result;
}
export async function recognizePdf({source,tools,directory,startPage=1,endPage=1,language='eng',signal,guard=async()=>{},run=runCommand,onProgress=()=>{}}){
 if(!source||!Buffer.isBuffer(source.bytes)||!tools||!(tools.pdfRasterWasm===true||['pdfinfo','pdftoppm'].every(k=>typeof tools[k]==='string'&&path.isAbsolute(tools[k])))||(!tools.wasm&&(typeof tools.executable!=='string'||!path.isAbsolute(tools.executable)))||!directory)throw Error('PDF OCR运行环境未就绪');
 const checked=async()=>{signal?.throwIfAborted();await abortablePdfWork(guard,signal);signal?.throwIfAborted();};
 const firstFive=endPage==='first5';if(!Number.isInteger(startPage)||startPage<1||startPage>100||(!firstFive&&(!Number.isInteger(endPage)||endPage<startPage||endPage-startPage>=5||endPage>100))||(firstFive&&startPage!==1))throw Error('每次只能识别连续1至5页，页码不超过100');if(!['eng','chi_sim','chi_sim+eng'].includes(language))throw Error('不支持该 OCR 语言');
 await checked();signal?.throwIfAborted();await mkdir(directory,{recursive:true,mode:0o700});const dir=await mkdtemp(path.join(directory,'pdf-ocr-'));
 try{const pdf=path.join(dir,'source.pdf');await writeFile(pdf,source.bytes,{flag:'wx',mode:0o600});const raster=tools.pdfRasterWasm?await materializePdfRaster(path.join(dir,'pdf-runtime'),{signal}):null;await checked();let pages;if(raster){pages=(await runPdfRaster({script:raster,mode:'info',pdf,directory:dir,signal,guard:checked,run})).pages;}else{const info=await run({executable:tools.pdfinfo,args:[pdf],cwd:dir,timeoutMs:15000},{signal,maxBytes:65536});signal?.throwIfAborted();await checked();if(info.status!=='succeeded')throw Error('PDF无法读取，可能加密、损坏或未支持');pages=Number(info.stdout.match(/^Pages:\s*(\d+)\s*$/m)?.[1]);}if(!Number.isInteger(pages)||pages<1||pages>100)throw Error('PDF页数或页码超出范围');if(firstFive)endPage=Math.min(5,pages);if(endPage>pages)throw Error('PDF页数或页码超出范围');
 const output=[];let total=0;for(let page=startPage;page<=endPage;page++){signal?.throwIfAborted();await checked();signal?.throwIfAborted();onProgress({page,index:page-startPage+1,total:endPage-startPage+1});signal?.throwIfAborted();const prefix=path.join(dir,'page');if(raster){await runPdfRaster({script:raster,mode:'render',pdf,page,output:prefix+'.png',directory:dir,signal,guard:checked,run});}else{const rendered=await run({executable:tools.pdftoppm,args:['-f',String(page),'-l',String(page),'-singlefile','-scale-to','1600','-png',pdf,prefix],cwd:dir,timeoutMs:30000},{signal,maxBytes:65536});signal?.throwIfAborted();await checked();if(rendered.status!=='succeeded')throw Error('PDF页面渲染失败：第'+page+'页');}const file=prefix+'.png',st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>4*1024*1024)throw Error('PDF页面图片无效或超限');const h=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);let image;try{image=await boundedRead(h,4*1024*1024);}finally{await h.close();}if(image.length!==st.size)throw Error('PDF页面图片读取不完整');const dims=imageInfo(image,{pngOnly:true});if(dims.width>1600||dims.height>1600||dims.width*dims.height>2560000)throw Error('PDF页面尺寸超限');
 const result=await recognizeImage({image:{id:source.folderId,sha256:source.sha256,name:source.name,bytes:image,width:dims.width,height:dims.height},engine:tools,directory:dir,language,signal,guard:()=>signal?.throwIfAborted(),beforeLaunch:checked,run,allowEmpty:true});await checked();total+=result.text.length;if(total>30000)throw Error('PDF识别正文合计超过30000字符');output.push({page,text:result.text,boxes:result.boxes,boxesTruncated:result.boxesTruncated,coordinateSpace:{...result.coordinateSpace,rasterSha256:digest(image)},...(!result.text?{note:'本页未识别出文字，不能证明原页为空'}:{})});await rm(file,{force:true});}
 const result={status:'succeeded',source:{folderId:source.folderId,relative:source.relative,name:source.name,sha256:source.sha256,totalPages:pages,renderer:raster?'pdfium-wasm-v1':'poppler-v1'},pages:output,language,note:'识别文字可能有误；坐标是渲染后页面图片像素，并非PDF原生坐标；仅包含所选页。'};return boundPdfOcrResult(result);
 }finally{await rm(dir,{recursive:true,force:true});}
}
