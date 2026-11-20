import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {runCommand} from '../runtime/command.mjs';
import {imageInfo} from '../src/shared/image-bytes.js';
import {selectOcrEvidence} from './ocr-source-open.mjs';
import {materializePdfRaster,runPdfRaster} from '../runtime/pdf-raster-wasm.mjs';
import {abortablePdfWork} from '../runtime/pdf-ocr.mjs';

// File selection and all PDF rendering share one slot. Reject excess requests
// rather than retaining private PDF data in an unbounded queue.
export function createOcrPreviewLimiter(preview=previewOcrSource){
  let busy=false;
  return async options=>{
    if(busy)throw Error('已有OCR原文预览正在处理，请稍后重试');
    busy=true;
    try{return await preview(options);}finally{busy=false;}
  };
}

// The snapshot supplies the page and geometry. Paths come only from the host's
// native selector. A changed file or evidence invalidates the whole preview.
export async function previewOcrSource({store,reference,choose,read,tools,directory,signal,run=runCommand,readImage,rasterMaterialize=materializePdfRaster,rasterRun=runPdfRaster}){
  signal?.throwIfAborted();
  const before=selectOcrEvidence(store,reference), regions=before.regions;
  // Older evidence did not record the rasterizer: it may have been produced
  // by Poppler or PDFium even when both render to the same pixel dimensions.
  // Opening the original remains available; avoid asserting a false overlay.
  if(!before.renderer)throw Error('历史OCR证据未记录渲染器，请重新识别后定位，或打开原PDF核对');
  if(!Array.isArray(regions)||!regions.length||regions.length>16||regions.some(r=>!r||typeof r!=='object'))throw Error('此证据没有可核对的页面定位');
  const pageNumbers=[...new Set(regions.map(r=>r.page))].sort((a,b)=>a-b);
  if(pageNumbers.length>5||pageNumbers.some(p=>!Number.isInteger(p)||!before.pages.includes(p)))throw Error('证据页码无效');
  for(const page of pageNumbers){
    const boxes=regions.filter(r=>r.page===page);
    for(const b of boxes)if(![b.x,b.y,b.w,b.h,b.width,b.height].every(Number.isInteger)||b.width<1||b.height<1||b.width>1600||b.height>1600||b.x<0||b.y<0||b.w<1||b.h<1||b.x+b.w>b.width||b.y+b.h>b.height||b.width!==boxes[0].width||b.height!==boxes[0].height||!/^[a-f0-9]{64}$/.test(b.rasterSha256||'')||b.rasterSha256!==boxes[0].rasterSha256)throw Error('证据坐标无效');
  }
  const file=await abortablePdfWork(()=>choose(before),signal);if(!file)return false;
  if(typeof file!=='string'||!file.toLowerCase().endsWith('.pdf'))throw Error('请选择原PDF文件');
  const check=()=>{signal?.throwIfAborted();if(selectOcrEvidence(store,reference).fingerprint!==before.fingerprint)throw Error('证据已变化，请重试');};
  check();const bytes=await abortablePdfWork(()=>read(file),signal);check();
  if(!Buffer.isBuffer(bytes)||bytes.length<5||bytes.length>16*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(bytes).digest('hex')!==before.sha256)throw Error('所选PDF与此OCR来源不一致');
  const engine=await abortablePdfWork(()=>tools(),signal);check();
  // Never silently switch the recorded coordinate system to another renderer.
  const usePdfium=before.renderer==='pdfium-wasm-v1';
  if(!usePdfium && (typeof engine?.pdftoppm!=='string'||!path.isAbsolute(engine.pdftoppm)))throw Error('原OCR使用的PDF渲染工具不可用，不能可靠定位');
  await mkdir(directory,{recursive:true,mode:0o700});const dir=await mkdtemp(path.join(directory,'ocr-evidence-'));
  try{
    const pdf=path.join(dir,'source.pdf');await writeFile(pdf,bytes,{flag:'wx',mode:0o600});check();
    const raster=usePdfium?await rasterMaterialize(path.join(dir,'pdf-runtime'),{signal,guard:check}):null;check();
    const pages=[];let total=0;
    for(const page of pageNumbers){
      const boxes=regions.filter(r=>r.page===page),prefix=path.join(dir,'page-'+page);
      if(raster) await rasterRun({script:raster,mode:'render',pdf,page,output:prefix+'.png',directory:dir,signal,guard:check,run});
      else {const result=await run({executable:engine.pdftoppm,args:['-f',String(page),'-l',String(page),'-singlefile','-scale-to','1600','-png',pdf,prefix],cwd:dir,timeoutMs:30000},{signal,maxBytes:65536});check();if(result.status!=='succeeded')throw Error('原PDF页面渲染失败');}
      const image=await abortablePdfWork(()=>readImage(prefix+'.png'),signal);check();
      if(!Buffer.isBuffer(image)||image.length>4*1024*1024||(total+=image.length)>8*1024*1024)throw Error('页面预览超过大小限制');
      const info=imageInfo(image,{pngOnly:true});
      if(info.width!==boxes[0].width||info.height!==boxes[0].height)throw Error('原页渲染尺寸与OCR记录不一致，无法可靠定位');
      if(createHash('sha256').update(image).digest('hex')!==boxes[0].rasterSha256)throw Error('原页渲染结果与OCR记录不一致，无法可靠定位');
      const current=await abortablePdfWork(()=>read(file),signal);check();if(!Buffer.isBuffer(current)||!current.equals(bytes))throw Error('所选PDF已变化，请重新选择');
      pages.push({page,width:info.width,height:info.height,base64:image.toString('base64'),boxes:boxes.map(({x,y,w,h})=>({x,y,w,h}))});
    }
    return {pages,regionsTruncated:before.regionsTruncated};
  }finally{await rm(dir,{recursive:true,force:true});}
}
