import path from 'node:path';
import {createHash} from 'node:crypto';
import {recognizePdf} from '../runtime/pdf-ocr.mjs';
import {makeOcrDocument} from '../runtime/ocr-provenance.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function validatePdfRange(range) {
  if(range===undefined)return {startPage:1,endPage:'first5'};
  if(!range || typeof range!=='object' || Array.isArray(range) || Object.keys(range).some(k=>!['startPage','endPage'].includes(k)) || !Number.isInteger(range.startPage) || !Number.isInteger(range.endPage) || range.startPage<1 || range.endPage>100 || range.endPage<range.startPage || range.endPage-range.startPage>=5)throw Error('请选择1至100页内连续最多5页');
  return {startPage:range.startPage,endPage:range.endPage};
}
// Abort waiting for host reads/dependency discovery; their underlying operation may
// still finish, but its result is discarded and cannot start recognition or commit.
async function abortable(factory,signal){
 signal?.throwIfAborted();if(!signal)return factory();let onAbort;
 const stopped=new Promise((_,reject)=>{onAbort=()=>reject(signal.reason||Error('已取消'));signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();});
 try{return await Promise.race([Promise.resolve().then(()=>{signal.throwIfAborted();return factory();}),stopped]);}finally{signal.removeEventListener('abort',onAbort);}
}
/** The host supplies a native-selected path and a bounded no-follow reader.
 * Raw bytes are temporary; only recognized text is stored after consent. */
export async function importChatPdf({file,read,confirm,tools,documents,directory,signal,range,onProgress=()=>{},recognize=recognizePdf}) {
  if(typeof file!=='string'||!file.toLowerCase().endsWith('.pdf')||typeof read!=='function'||typeof confirm!=='function')throw Error('PDF选择无效');
  const selected=validatePdfRange(range);
  const original=await abortable(()=>read(file),signal);signal?.throwIfAborted();
  if(!Buffer.isBuffer(original)||original.length<5||original.length>16*1024*1024||original.subarray(0,5).toString()!=='%PDF-')throw Error('PDF无效或超过16MiB');
  const name=path.basename(file), hash=sha(original);
  const language=await abortable(()=>confirm({name,sha256:hash,maxPages:5,...selected}),signal);signal?.throwIfAborted();
  if(language===null || language===false)return false;
  if(!['eng','chi_sim','chi_sim+eng'].includes(language))throw Error('OCR语言无效');
  const guard=async()=>{signal?.throwIfAborted();const current=await abortable(()=>read(file),signal);if(!Buffer.isBuffer(current)||sha(current)!==hash)throw Error('选择的PDF在识别期间变化，请重新选择');signal?.throwIfAborted();};
  await guard();const engine=await abortable(()=>tools(),signal);await guard();
  const source={folderId:'selected-pdf',name,sha256:hash,bytes:original};
  // A backend or adapter may ignore cancellation. Stop waiting and reject
  // subsequent progress from that invocation; never import its late result.
  let acceptingProgress=true, result;
  try {
    result=await abortable(()=>recognize({source,tools:engine,directory,...selected,language,signal,guard,onProgress:progress=>{if(acceptingProgress&&!signal?.aborted)onProgress(progress);}}),signal);
  } finally { acceptingProgress=false; }
  await guard();if(!result?.source || result.source.name!==name || result.source.sha256!==hash)throw Error('OCR识别结果来源与所选PDF不一致');
  const totalPages=result.source.totalPages;
  if(!Number.isInteger(totalPages)||totalPages<1||totalPages>100)throw Error('OCR识别结果页码范围无效');
  const expectedEnd=selected.endPage==='first5'?Math.min(5,totalPages):selected.endPage;
  if(expectedEnd>totalPages||!Array.isArray(result.pages)||result.pages.length!==expectedEnd-selected.startPage+1||result.pages.some((p,i)=>p?.page!==selected.startPage+i))throw Error('OCR识别结果与已批准页码范围不一致');
  const {text,provenance}=makeOcrDocument(result.source,result.pages);
  const base=name.slice(0,-4).replace(/[\u0000-\u001f/\\]/g,' ').trim().slice(0,80)||'PDF';
  const saved=await documents.importFile(base+'-OCR','md',Buffer.from(text,'utf8'),signal,guard,provenance);
  const d=saved.document, included=result.pages.length, total=result.source.totalPages, first=result.pages[0].page, last=result.pages.at(-1).page;
  return {attachments:[{documentId:d.id,revision:d.revision,sha256:d.sha256,name:d.name,text:d.text}],skipped:[],notice:`已识别第${first}–${last}页（共${total}页）；识别可能有误。${total>included?'其余页面未识别，不会发送给模型。':''}发送后识别文字将交给当前模型。`};
}
