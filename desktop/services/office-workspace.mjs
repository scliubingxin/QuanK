import {normalizeSlideAction,normalizeThumbnail,normalizeNotesWrite} from '../src/shared/office-pages.js'; // [lane:pages]
import {wordTableGridPlan} from '../runtime/office-table-grid.mjs';
import {wordFormatVerifier,wordTextVerifier} from '../runtime/office-word-format.mjs';
import {nativeFormulaPlan} from '../runtime/office-formula.mjs';
import {presentationTextVerifier,presentationFormatVerifier,normalizePresentationFormat} from '../runtime/office-presentation.mjs';
import {normalizeCellFormat,cellFormatVerifier} from '../runtime/office-cell-format.mjs';
import {cellSelection} from '../runtime/office-cells.mjs';
import {cellMatrix,cellUpdateVerifier,workbookContentsVerifier} from '../runtime/office-cells.mjs';
import {officeNavigation} from '../src/shared/office-navigation.js';
import {normalizeTableOutline,outlineOutputVerifier} from '../runtime/office-table-outline.mjs';
import {officeHistory,historyCommandAvailable} from '../src/shared/office-history.js';
import {normalizeOfficeFormat} from '../runtime/office-format.mjs';
import {validateSnapshotPng} from '../src/shared/office-zoom.js'; // [integ] render 线快照校验
import {validateUno} from '../src/shared/office-uno.js';
import officeVendor from '../runtime/vendor/office.cjs';import {docxOutline} from '../src/shared/office-doc.js'; // [docx]
 // [integ] ribbon 线 UNO 校验
import {validateSheetKey,validateSheetText,validateCellInput,validateGotoRef,validateBorder,validateSheetSize,validateSheetTab} from '../src/shared/office-sheet.js'; // [excel]
const INTERNAL=Symbol('wb-internal-uno');// [lane:ribbon] symbol keys never survive IPC structured clone
import {pathToFileURL} from 'node:url';import path from 'node:path';import {mkdtemp,mkdir,writeFile,lstat,rm,open,realpath} from 'node:fs/promises';import {constants} from 'node:fs';import {randomUUID} from 'node:crypto';import {inspectDocument} from '../runtime/documents.mjs';import {imageFromBase64} from '../src/shared/image-bytes.js';import {startOfficeKit} from '../runtime/office-kit.mjs';
const allowed=new Set(['.uno:Bold','.uno:Italic','.uno:Underline','.uno:Undo','.uno:Redo','.uno:SelectAll']);
const profile='<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Common/Load"><prop oor:name="UpdateDocMode" oor:op="fuse"><value>0</value></prop></item></oor:items>';
export function createOfficeWorkspace({documents,directory,runtime,approve=async()=>false,driver=startOfficeKit,notify=()=>{},audit=async()=>{},removeOfficeTemp=rm,closeWaitMs=5000,waitForEngine=async()=>{},allowStandby=()=>true,standbyIdleMs=30*60*1000,onStandbyTiming=()=>{}}){
 const sessions=new Map(),opening=new Set(),lifecycle=new AbortController();let closed=false,replacing=false;
 let spare, warming, spareTimer;
 const takeSpare=()=>{clearTimeout(spareTimer);const ready=spare;spare=null;return ready;};
 async function disposeSpare(slot){
  if(!slot)return;
  slot.worker.close?.();
  await slot.worker.closed;
  await rm(slot.dir,{recursive:true,force:true});
 }
 function prewarm(){
  if(warming)return warming;
  if(closed)return Promise.resolve(false);
  if(spare&&spare.worker.isAlive!==false)return Promise.resolve(true);
  warming=(async()=>{
   let dir;const started=performance.now();
   try{
    await disposeSpare(takeSpare());
    await mkdir(directory,{recursive:true,mode:0o700});
    dir=await mkdtemp(path.join(directory,'kit-'));
    await mkdir(path.join(dir,'profile/user'),{recursive:true,mode:0o700});
    await writeFile(path.join(dir,'profile/user/registrymodifications.xcu'),profile,{mode:0o600,flag:'wx'});
    const worker=await driver({...await runtime(),directory:dir,format:'standby',signal:lifecycle.signal,lowPriority:true});
    if(typeof worker?.load!=='function'||closed){
     worker?.close?.();
     await worker?.closed;
     throw Error('编辑待命进程不可用');
    }
    spare={dir,worker};dir=null;
    spareTimer=setTimeout(()=>{void disposeSpare(takeSpare()).catch(()=>{});},standbyIdleMs);
    spareTimer.unref?.();
    onStandbyTiming({ms:Math.round(performance.now()-started)});
    return true;
   }finally{
    if(dir)await rm(dir,{recursive:true,force:true}).catch(()=>{});
    warming=null;
   }
  })();
  return warming;
 }
 function find(id){const s=sessions.get(id);if(closed||!s)throw Error('Office会话已结束，请重新打开');return s;}
 function current(s){const d=documents.read(s.documentId);if(d.revision!==s.revision||d.sha256!==s.sha256)throw Error('文档已被其他任务修改，请重新打开，不能覆盖新版本');return d;}
 function locked(s,fn){const p=s.queue.then(async()=>{if(closed||sessions.get(s.id)!==s)throw Error('Office会话已结束，请重新打开');current(s);return fn();});s.queue=p.catch(()=>{});return p;}
 function meta(s){return {sessionId:s.id,documentId:s.documentId,name:s.name,format:s.format,revision:s.revision,sha256:s.sha256,dirty:s.dirty,sequence:s.sequence};}
 async function save(s,signal,verify){signal?.throwIfAborted();if(!s.dirty)return meta(s);await s.worker.request('save');const file=path.join(s.dir,'edited.'+s.format),st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>4*1024**2)throw Error('Office输出非普通文件或超过4MiB');const h=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);let b;try{b=await h.readFile();}finally{await h.close();}if(b.length>4*1024**2)throw Error('Office输出读取超限');const info=inspectDocument(s.format,b);(verify||s.verifyOutput)?.(b);signal?.throwIfAborted();current(s);if(info.sha256!==s.sha256){const r=await documents.replaceBytes(s.documentId,s.revision,b,signal,{nativeOffice:true});s.revision=r.document.revision;s.sha256=r.document.sha256;}s.dirty=false;s.verifyOutput=null;notify();return meta(s);}
 async function snap(s,p={}){const out=await s.worker.request('snapshot',p);validateSnapshotPng(out.png,{width:out.width,height:out.height});if(out.selection?.length>12000)throw Error('Office画面或选区超限');s.selection=out.selection||'';return {...meta(s),...out,history:officeHistory(out.history)};}
 async function checkCells(s,sequence,selection,cells,signal){signal?.throwIfAborted();current(s);if(sequence!==s.sequence)throw Error('Excel选区已变化');const shot=await snap(s);if(shot.selection!==selection)throw Error('Excel内容选区已变化');const fresh=(await s.worker.request('cells_context')).cells;signal?.throwIfAborted();current(s);if(Date.now()-s.opened>30*60*1000)throw Error('编辑授权已过30分钟');if(sequence!==s.sequence||!fresh||JSON.stringify(fresh)!==JSON.stringify(cells))throw Error('原生Excel工作表、区域或内容已变化；请重新定位范围');}
 return {
 async open(documentId,revision,{onApproved}={}){if(closed||opening.has(documentId)||[...sessions.values()].some(s=>s.documentId===documentId))throw Error('文档已在QuanK Office打开');if(sessions.size+opening.size>=2)throw Error('最多打开2份Office文档');opening.add(documentId);let dir,worker;try{const d=documents.read(documentId);if(d.revision!==revision)throw Error('文档版本已变化');const file=documents.bytes(documentId,revision);if(!['docx','xlsx','pptx'].includes(file.format))throw Error('仅支持Office文档');inspectDocument(file.format,file.bytes);if(await approve('打开QuanK Office编辑',d.name+'.'+file.format+'\n使用QuanK内置文档引擎，手动编辑直接保存本机文档新版本，无需退出或收回。宏禁用，仍有当前账号权限，非OS沙箱。AI发送资料和修改选区另行批准。')!==true)return {status:'denied'};try{onApproved?.();}catch{}await waitForEngine();if(warming)await warming.catch(()=>{});lifecycle.signal.throwIfAborted();const currentDocument=documents.read(documentId);if(currentDocument.sha256!==file.sha256||currentDocument.revision!==revision)throw Error('审批或启动期间文档变化');const ready=takeSpare();if(ready){try{await writeFile(path.join(ready.dir,'document.'+file.format),file.bytes,{mode:0o600,flag:'wx'});await ready.worker.load(file.format);dir=ready.dir;worker=ready.worker;}catch{await disposeSpare(ready).catch(()=>{});}}
 if(!worker){await mkdir(directory,{recursive:true,mode:0o700});dir=await mkdtemp(path.join(directory,'kit-'));await mkdir(path.join(dir,'profile/user'),{recursive:true,mode:0o700});await writeFile(path.join(dir,'profile/user/registrymodifications.xcu'),profile,{mode:0o600,flag:'wx'});await writeFile(path.join(dir,'document.'+file.format),file.bytes,{mode:0o600,flag:'wx'});worker=await driver({...await runtime(),directory:dir,format:file.format});}const s={id:randomUUID(),documentId,name:d.name,format:file.format,revision,sha256:file.sha256,dir,worker,queue:Promise.resolve(),dirty:false,sequence:0,selection:'',opened:Date.now()};if(closed)throw Error('Office服务已关闭');sessions.set(s.id,s);dir=null;worker=null;if(allowStandby())void prewarm().catch(()=>{});return meta(s);}finally{opening.delete(documentId);worker?.close();if(dir)await rm(dir,{recursive:true,force:true});}},
 async snapshot(id,p){const s=find(id),options={};if(p?.fonts===true)options.fonts=true;for(const k of ['width','height','x','y','scale','tileWidth','tileHeight'])if(p?.[k]!==undefined){if(!Number.isInteger(p[k])||p[k]<0||p[k]>((k==='x'||k==='y')&&s.format==='xlsx'?300000000:2000000))throw Error('画面参数无效');options[k]=p[k];}return locked(s,()=>snap(s,options));},
 async operation(id,op,p={}){const s=find(id);if(Date.now()-s.opened>30*60*1000)throw Error('编辑授权已过30分钟，请保存关闭后重新打开');let data,mutates=false,soft=['xlsx','docx'].includes(s.format)&&['mouse','part'].includes(op);// [excel] soft: native Calc may commit an in-cell edit; the worker reports it

 if(op==='paste'){if(typeof p.text!=='string'||!p.text||p.text.length>4000||p.text.includes('\0'))throw Error('输入文字超限');data={text:p.text};mutates=true;}
 else if(op==='command'){if(s.format==='xlsx'&&p.command==='.uno:SelectAll')throw Error('表格请先定位有限单元格范围，不支持整张工作表全选');if(!allowed.has(p.command))throw Error('不支持的编辑命令');data={command:p.command};mutates=p.command!=='.uno:SelectAll';}
 else if(op==='navigate'){if(!['docx','pptx'].includes(s.format))throw Error('键盘选区目前仅支持Word和PPT文字');data=officeNavigation(p);}
 // [integ] 鼠标动作白名单：0=按下 1=抬起 2=移动（LOK_MOUSEEVENT_MOUSEMOVE）；拖动中新增转发的 type:2 已在许可范围内，无需再追加项。
 else if(op==='mouse'){for(const k of ['type','x','y'])if(!Number.isInteger(p[k])||p[k]<0||p[k]>(k!=='type'&&s.format==='xlsx'?300000000:2000000))throw Error('鼠标坐标无效');if(p.type>2)throw Error('鼠标动作无效');data={type:p.type,x:p.x,y:p.y,count:p.count===2?2:1,buttons:p.buttons===0?0:1};}
 else if(op==='range'){if(s.format!=='xlsx'||typeof p.ref!=='string'||!/^([A-Z]{1,2})([1-9][0-9]{0,3})(?::([A-Z]{1,2})([1-9][0-9]{0,3}))?$/.test(p.ref))throw Error('请输入A1或A1:B10单元格范围');const m=p.ref.match(/^([A-Z]+)([0-9]+)(?::([A-Z]+)([0-9]+))?$/),col=s=>[...s].reduce((a,c)=>a*26+c.charCodeAt(0)-64,0),x=col(m[1]),y=+m[2],x2=col(m[3]||m[1]),y2=+(m[4]||m[2]);if(Math.max(x,x2)>128||Math.max(y,y2)>5000||x2<x||y2<y||(x2-x+1)*(y2-y+1)>1000)throw Error('选区限128列/5000行内的1000格');data={ref:p.ref};}
 else if(op==='part'){if(!Number.isInteger(p.part)||p.part<0||p.part>999)throw Error('页签无效');data={part:p.part};}
 else if(op==='uno'){const v=validateUno(p.command,p.args,{format:s.format,allowInternal:p[INTERNAL]===true});data={command:v.command,args:v.args};mutates=true;}// [lane:ribbon]
 else if(['sheet_key','sheet_text','cell_input','sheet_goto','sheet_border','sheet_size','sheet_tab'].includes(op)){// [excel] spreadsheet editing; every payload is rebuilt from validated fields
  if(s.format!=='xlsx'&&!(s.format==='docx'&&['sheet_key','sheet_text'].includes(op)))throw Error('仅表格支持该操作');// [docx] typing and keys are shared with the Word editor
  if(op==='sheet_key'){data=validateSheetKey({key:p.key,shift:p.shift,control:p.control,alt:p.alt});soft=true;}
  else if(op==='sheet_text'){data={text:validateSheetText(p.text)};soft=true;}
  else if(op==='sheet_goto'){data={ref:validateGotoRef(p.ref)};soft=true;}
  else if(op==='cell_input'){data=validateCellInput({text:p.text,move:p.move});mutates=true;}
  else if(op==='sheet_border'){data=validateBorder({kind:p.kind,color:p.color,style:p.style});mutates=true;}
  else if(op==='sheet_size'){data=validateSheetSize({axis:p.axis,index:p.index,size:p.size});mutates=true;}
  else{data=validateSheetTab({action:p.action,index:p.index,name:p.name,to:p.to,color:p.color});mutates=true;}
 }
 else throw Error('不支持的Office操作');
 return locked(s,async()=>{if(Date.now()-s.opened>30*60*1000)throw Error('编辑授权已过30分钟，请保存关闭后重新打开');if(op==='command'&&['.uno:Undo','.uno:Redo'].includes(data.command)){const history=await s.worker.request('history');current(s);if(!historyCommandAvailable(history,data.command))throw Error('当前没有可用的撤销/重做记录，或内核未提供历史状态');}
  let verify;if(op==='paste'&&s.format==='pptx'){
   if(s.dirty)throw Error('请先保存当前草稿，再修改PPT文字');
   const shot=await snap(s);current(s);
   if(shot.selection){if(shot.selectionType!==1)throw Error('请先进入PPT文字编辑并选择文字');verify=presentationTextVerifier(documents.bytes(s.documentId,s.revision).bytes,shot.part,shot.selection,data.text,{manual:true});data={...data,expectedSelection:shot.selection,part:shot.part};s.verifyOutput=verify;}
  }
  if(mutates){s.sequence++;s.dirty=true;}const out=await s.worker.request(op,data);if(!mutates)s.sequence++;if(soft&&out?.changed===true)s.dirty=true;await save(s,undefined,verify);return meta(s);});},
 async insertImage(id,{name,bytes}){// [lane:ribbon] bytes come from the main-process file dialog, never from the renderer
  const s=find(id);if(!['pptx','xlsx','docx'].includes(s.format))throw Error('当前文档不支持插入图片');// [excel]if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>4*1024**2)throw Error('图片为空或超过4MiB');
  const png=bytes.length>8&&Buffer.from(bytes.subarray(0,8)).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),jpg=bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;if(!png&&!jpg)throw Error('仅支持PNG或JPEG图片');
  const dir=path.join(s.dir,'uploads');await mkdir(dir,{recursive:true,mode:0o700});const file=path.join(dir,'img-'+randomUUID()+(png?'.png':'.jpg'));await writeFile(file,bytes,{mode:0o600,flag:'wx'});
  return this.operation(id,'uno',{command:'.uno:InsertGraphic',args:{FileName:pathToFileURL(await realpath(file)).href},[INTERNAL]:true});},
 async save(id){const s=find(id);return locked(s,()=>save(s));},
 // [docx] headings for the outline panel, read from the latest saved revision (every edit is saved immediately).
 async outline(id){const s=find(id);if(s.format!=='docx')throw Error('仅文字文档支持大纲');return locked(s,async()=>{const files=officeVendor.zip.unzipSync(documents.bytes(s.documentId,s.revision).bytes),text=n=>files[n]?new TextDecoder().decode(files[n]):'';return {items:docxOutline(text('word/document.xml'),text('word/styles.xml'))};});},
 // [lane:pages] page-level operations; each mutating call is saved as a new revision like every other edit.
 async thumbnail(id,p){const s=find(id);if(s.format!=='pptx')throw Error('仅PPT支持缩略图');const q=normalizeThumbnail(p);return locked(s,async()=>{const r=await s.worker.request('thumbnail',q);if(imageFromBase64(r.png).length>(q.width>480?4*1024**2:512*1024))throw Error('缩略图超限');return r;});},
 async slideAction(id,p){const s=find(id);if(s.format!=='pptx')throw Error('仅PPT支持页面操作');return locked(s,async()=>{if(Date.now()-s.opened>30*60*1000)throw Error('编辑授权已过30分钟，请保存关闭后重新打开');const info=await s.worker.request('snapshot',{width:200,height:200}),q=normalizeSlideAction(p,info.parts.length);s.sequence++;s.dirty=true;const r=await s.worker.request('slide_action',q);await save(s);return {...meta(s),...r};});},
 async notesGet(id){const s=find(id);if(s.format!=='pptx')throw Error('仅PPT支持备注');return locked(s,async()=>(await s.worker.request('notes_get')));},
 async notesSet(id,p){const s=find(id);if(s.format!=='pptx')throw Error('仅PPT支持备注');return locked(s,async()=>{if(Date.now()-s.opened>30*60*1000)throw Error('编辑授权已过30分钟，请保存关闭后重新打开');const count=(await s.worker.request('snapshot',{width:200,height:200})).parts.length,q=normalizeNotesWrite(p,count);s.sequence++;s.dirty=true;await s.worker.request('notes_set',q);await save(s);return {...meta(s),part:q.part};});},
 async deckInfo(id,p){const s=find(id);if(s.format!=='pptx')throw Error('仅PPT支持');if(!Number.isInteger(p?.part)||p.part<0||p.part>999)throw Error('页码无效');return locked(s,()=>s.worker.request('deck_info',{part:p.part}));},
 async viewMode(id,p){const s=find(id);if(s.format!=='pptx'||!['master','normal'].includes(p?.mode))throw Error('视图模式无效');return locked(s,()=>s.worker.request('view_mode',{mode:p.mode}));},
 async context(id){const s=find(id);return locked(s,async()=>{await save(s);const shot=await snap(s);const text=documents.read(s.documentId).text;if(text.length>20000&&!shot.selection)throw Error('正文超过2万字符，请选择内容后提问');return {...meta(s),selection:shot.selection,table:shot.table,cells:shot.cells,text:text.length<=20000?text:''};});},
 async replaceSelection(id,{sequence,selection,text},signal,options={}){const s=find(id),manual=options.manual===true;if(s.format==='xlsx')throw Error('Excel请使用同尺寸office_update_cells工具，不能通用粘贴扩展选区');return locked(s,async()=>{
  if(s.dirty)throw Error('请先保存当前草稿，再修改文字');
  async function check(){signal?.throwIfAborted();current(s);if(Date.now()-s.opened>30*60*1000)throw Error('编辑授权已过30分钟');if(sequence!==s.sequence||!selection||selection.length>12000||typeof text!=='string'||(!text&&!manual)||text.length>(manual?4000:600))throw Error('选区已变化、为空或修改超过长度限制');const shot=await snap(s);signal?.throwIfAborted();current(s);if(Date.now()-s.opened>30*60*1000)throw Error('编辑授权已过30分钟');if(sequence!==s.sequence||shot.selection!==selection)throw Error('真实Office选区已变化');if(s.format==='pptx'&&(shot.selectionType!==1||shot.part!==part))throw Error('PPT文字选区或页面已变化');}
  const first=s.format==='pptx'?await snap(s):null,part=first?.part;await check();const verify=s.format==='pptx'?presentationTextVerifier(documents.bytes(s.documentId,s.revision).bytes,part,selection,text,{manual}):wordTextVerifier(documents.bytes(s.documentId,s.revision).bytes,selection,text);
  await check();if(!manual&&await approve('AI修改Office选区','把选中内容替换为：\n'+text+'\n将保存新版本，原件及前版保留。',signal)!==true)throw Error('选区修改未批准');await check();const executionId=randomUUID(),tool=manual?'office_manual_replace_selection':'office_replace_selection';await audit({id:executionId,tool,status:'running',documentId:s.documentId,revision:s.revision,time:Date.now()});try{await check();s.verifyOutput=verify;s.sequence++;s.dirty=true;await s.worker.request('paste',{text,...s.format==='pptx'?{expectedSelection:selection,part}:{expectedSelection:selection} });await save(s,signal,verify);await audit({id:executionId,tool,status:'succeeded',documentId:s.documentId,revision:s.revision,sha256:s.sha256,time:Date.now()});return {status:'succeeded',...meta(s)};}catch(e){await audit({id:executionId,tool,status:'failed',documentId:s.documentId,revision:s.revision,time:Date.now()}).catch(()=>{});throw e;}
 });},
 async manualReplaceSelection(id,p){if(!['pptx','docx'].includes(find(id).format))throw Error('该选区编辑方式目前仅支持Word和PPT');return this.replaceSelection(id,p,undefined,{manual:true});},
 async formatPresentation(id,{sequence,selection,...properties},signal){const s=find(id);return locked(s,async()=>{
  if(s.format!=='pptx'||s.dirty)throw Error('请先保存当前PPT草稿，再修改选区格式');
  const data=normalizePresentationFormat(properties),first=await snap(s),part=first.part,verify=presentationFormatVerifier(documents.bytes(s.documentId,s.revision).bytes,part,selection,data);
  const check=async()=>{signal?.throwIfAborted();find(id);current(s);if(sequence!==s.sequence)throw Error('PPT选区已变化');const shot=await snap(s);signal?.throwIfAborted();find(id);current(s);if(Date.now()-s.opened>30*60*1000)throw Error('编辑授权已过30分钟');if(sequence!==s.sequence||shot.selection!==selection||shot.selectionType!==1||shot.part!==part)throw Error('真实PPT文字选区或页面已变化');};
  await check();if(await approve('AI修改PPT选中文字格式','第'+(part+1)+'页，仅设置当前选中文字：'+(data.fontSize!==undefined?'字号 '+data.fontSize+' pt；':'')+(data.fontColor?'文字颜色 '+data.fontColor+'；':'')+'不替换文字，保存新版本；原件及前版保留。',signal)!==true)throw Error('PPT格式修改未批准');await check();
  const executionId=randomUUID();await audit({id:executionId,tool:'office_format_presentation',status:'running',documentId:s.documentId,revision:s.revision,time:Date.now()});try{await check();s.verifyOutput=verify;s.sequence++;s.dirty=true;await s.worker.request('ppt_format',{...data,expectedSelection:selection,part});await save(s,signal,verify);await audit({id:executionId,tool:'office_format_presentation',status:'succeeded',documentId:s.documentId,revision:s.revision,sha256:s.sha256,time:Date.now()});return {status:'succeeded',...meta(s)};}catch(e){await audit({id:executionId,tool:'office_format_presentation',status:'failed',documentId:s.documentId,revision:s.revision,time:Date.now()}).catch(()=>{});throw e;}
 });},
 async formatSelection(id,{sequence,selection,fontName,fontNameAsian,fontSize,fontColor,backgroundColor},signal){const s=find(id);return locked(s,async()=>{signal?.throwIfAborted();if(Date.now()-s.opened>30*60*1000)throw Error('编辑授权已过30分钟');if(s.format!=='docx')throw Error('本轮字体编辑仅支持Word文档');if(s.dirty)throw Error('请先保存当前草稿，再修改格式');const data=normalizeOfficeFormat({fontName,fontNameAsian,fontSize,fontColor,backgroundColor});if(sequence!==s.sequence||!selection||selection.length>12000||(await snap(s)).selection!==selection)throw Error('真实Office选区已变化或为空');const verify=wordFormatVerifier(documents.bytes(s.documentId,s.revision).bytes,selection,data);const check=async()=>{signal?.throwIfAborted();current(s);if(sequence!==s.sequence||(await snap(s)).selection!==selection)throw Error('真实Word选区已变化');signal?.throwIfAborted();current(s);if(Date.now()-s.opened>30*60*1000)throw Error('编辑授权已过30分钟');if(sequence!==s.sequence)throw Error('Word选区已变化');};const detail=(data.fontName?'字体：'+data.fontName+'（西文字体属性；未安装时可能替代显示）\n':'')+(data.fontNameAsian?'东亚字体：'+data.fontNameAsian+'（未安装时可能替代显示）\n':'')+(data.fontSize?'字号：'+data.fontSize+' pt\n':'')+(data.fontColor?'文字颜色：'+data.fontColor+'\n':'')+(data.backgroundColor?'文字背景色：'+data.backgroundColor+'\n':'')+'仅修改当前选区格式，保存新版本；原件及前版保留。';if(await approve('修改Office选区字体与字号颜色',detail,signal)!==true)throw Error('格式修改未批准');await check();const executionId=randomUUID();await audit({id:executionId,tool:'office_format_selection',status:'running',documentId:s.documentId,revision:s.revision,time:Date.now()});try{await check();s.verifyOutput=verify;s.sequence++;s.dirty=true;await s.worker.request('format',{...data,expectedSelection:selection});await save(s,signal,verify);await audit({id:executionId,tool:'office_format_selection',status:'succeeded',documentId:s.documentId,revision:s.revision,sha256:s.sha256,time:Date.now()});return {status:'succeeded',...meta(s)};}catch(e){await audit({id:executionId,tool:'office_format_selection',status:'failed',documentId:s.documentId,revision:s.revision,time:Date.now()}).catch(()=>{});throw e;}});},
 async formatCells(id,{sequence,selection,cells,fontSize,fontColor,backgroundColor,bold,italic},signal){const s=find(id);return locked(s,async()=>{
  if(s.format!=='xlsx')throw Error('单元格格式仅支持Excel');if(s.dirty)throw Error('请先保存当前草稿，再修改格式');cells={...cells};cellSelection(cells);const format=normalizeCellFormat(Object.fromEntries(Object.entries({fontSize,fontColor,backgroundColor,bold,italic}).filter(([,v])=>v!==undefined))),source=documents.bytes(s.documentId,s.revision).bytes,verifyFormat=cellFormatVerifier(source,cells,format),verifyContent=workbookContentsVerifier(source,cells,{preserveTarget:true}),verify=output=>{verifyFormat(output);verifyContent(output);},check=()=>checkCells(s,sequence,selection,cells,signal);
  await check();if(await approve('AI修改Excel选区格式',`工作表${cells.part+1}，范围${cells.ref}。仅修改以下格式，不替换数据或公式；保存新版本、原件前版保留。字号单位pt，颜色为RGB。\n`+JSON.stringify(format),signal)!==true)throw Error('单元格格式未批准');await check();const executionId=randomUUID();await audit({id:executionId,tool:'office_format_cells',status:'running',documentId:s.documentId,revision:s.revision,time:Date.now()});try{await check();s.verifyOutput=verify;s.dirty=true;s.sequence++;await s.worker.request('cells_format',{cells,format});await save(s,signal,verify);await audit({id:executionId,tool:'office_format_cells',status:'succeeded',documentId:s.documentId,revision:s.revision,sha256:s.sha256,time:Date.now()});return {status:'succeeded',...meta(s)};}catch(e){await audit({id:executionId,tool:'office_format_cells',status:'failed',documentId:s.documentId,revision:s.revision,time:Date.now()}).catch(()=>{});throw e;}
 });},
 async manualUpdateCells(id,p){return this.updateCells(id,p,undefined,{manual:true});},
 async setFormula(id,{sequence,selection,cells,formula},signal){const s=find(id);return locked(s,async()=>{
  if(s.format!=='xlsx')throw Error('公式工具仅支持Excel');if(s.dirty)throw Error('请先保存当前草稿，再写公式');cells={...cells};const source=documents.bytes(s.documentId,s.revision).bytes,plan=nativeFormulaPlan(source,cells,formula),verifyOther=workbookContentsVerifier(source,cells),verify=output=>{plan.verify(output);verifyOther(output);},check=()=>checkCells(s,sequence,selection,cells,signal);
  await check();if(await approve('AI写入Excel单元格公式',`工作表${cells.part+1}，单元格${cells.ref}。覆盖该格原内容并由本机内核计算；保存新版本，原件前版保留。只支持有界同表公式，无外部调用。\n=${plan.formula}`,signal)!==true)throw Error('公式修改未批准');await check();const executionId=randomUUID();await audit({id:executionId,tool:'office_set_formula',status:'running',documentId:s.documentId,revision:s.revision,time:Date.now()});try{await check();s.verifyOutput=verify;s.dirty=true;s.sequence++;await s.worker.request('formula',{cells,formula:plan.formula});await save(s,signal,verify);await audit({id:executionId,tool:'office_set_formula',status:'succeeded',documentId:s.documentId,revision:s.revision,sha256:s.sha256,time:Date.now()});return {status:'succeeded',...meta(s)};}catch(e){await audit({id:executionId,tool:'office_set_formula',status:'failed',documentId:s.documentId,revision:s.revision,time:Date.now()}).catch(()=>{});throw e;}
 });},
 async updateCells(id,{sequence,selection,cells,values},signal,options={}){const s=find(id),manual=options.manual===true;return locked(s,async()=>{
  if(s.format!=='xlsx')throw Error('单元格工具仅支持Excel');if(s.dirty)throw Error('请先保存当前草稿，再修改单元格');cells={...cells};const matrix=cellMatrix(values,cells),verify=cellUpdateVerifier(documents.bytes(s.documentId,s.revision).bytes,cells,matrix);
  const check=()=>checkCells(s,sequence,selection,cells,signal);
  await check();if(!manual&&await approve('AI修改Excel单元格区域',`工作表${cells.part+1}，范围${cells.ref}（${cells.rows}行×${cells.columns}列）。以下矩阵覆盖区域原内容（包括原有公式），不扩大范围；普通字符串按内核识别；{text:…}强制原样文本，等号不执行公式。保存新版本、原件前版保留。\n`+JSON.stringify(matrix),signal)!==true)throw Error('单元格修改未批准');await check();const executionId=randomUUID(),tool=manual?'office_manual_update_cells':'office_update_cells';await audit({id:executionId,tool,status:'running',documentId:s.documentId,revision:s.revision,time:Date.now()});try{await check();s.verifyOutput=verify;s.dirty=true;s.sequence++;await s.worker.request('cells',{cells,values:matrix});await save(s,signal,verify);await audit({id:executionId,tool,status:'succeeded',documentId:s.documentId,revision:s.revision,sha256:s.sha256,time:Date.now()});return {status:'succeeded',...meta(s)};}catch(e){await audit({id:executionId,tool,status:'failed',documentId:s.documentId,revision:s.revision,time:Date.now()}).catch(()=>{});throw e;}
 });},
 async tableOutline(id,{sequence,selection,table,...properties},signal){const s=find(id);return locked(s,async()=>{
  signal?.throwIfAborted();if(s.format!=='docx'||Date.now()-s.opened>30*60*1000)throw Error('仅支持有效授权中的Word文档');if(s.dirty)throw Error('请先保存当前Word草稿，再设置外框');const border=normalizeTableOutline(properties),verify=outlineOutputVerifier(documents.bytes(s.documentId,s.revision).bytes,table,border);
  async function check(){signal?.throwIfAborted();current(s);if(sequence!==s.sequence||!selection||(await snap(s)).selection!==selection)throw Error('真实Office选区变化');const fresh=(await s.worker.request('table_context')).table;signal?.throwIfAborted();current(s);if(Date.now()-s.opened>30*60*1000)throw Error('编辑授权已过30分钟');if(!table?.fingerprint||!fresh||fresh.fingerprint!==table.fingerprint||fresh.rows!==table.rows||fresh.columns!==table.columns)throw Error('请选择单一简单矩形Word表格区域，原表格选区已变化或不支持');}
  await check();if(await approve('设置Word表格外框样式',`当前选区${table.rows}行×${table.columns}列；实线外框${border.color} / ${border.width}pt；四边内边距${border.padding}pt。仅支持正文唯一、完整且无合并的表格；将清除区域内部线，不是所有网格线。保存前检查直接边框、内边距和单元格文字；保存新版本，原件与前版保留。`,signal)!==true)throw Error('表格样式未批准');await check();const executionId=randomUUID();await audit({id:executionId,tool:'office_table_outline',status:'running',documentId:s.documentId,revision:s.revision,time:Date.now()});try{await check();if(Date.now()-s.opened>30*60*1000)throw Error('编辑授权已过30分钟');s.verifyOutput=verify;s.sequence++;s.dirty=true;await s.worker.request('border',{border,tableFingerprint:table.fingerprint});await save(s,signal,verify);await audit({id:executionId,tool:'office_table_outline',status:'succeeded',documentId:s.documentId,revision:s.revision,sha256:s.sha256,time:Date.now()});return {status:'succeeded',...meta(s)};}catch(e){await audit({id:executionId,tool:'office_table_outline',status:'failed',documentId:s.documentId,revision:s.revision,time:Date.now()}).catch(()=>{});throw e;}
 });},
 async tableGrid(id,{sequence,selection,table,...properties},signal){const s=find(id);return locked(s,async()=>{
  if(s.format!=='docx'||s.dirty)throw Error('请先保存当前Word草稿，再修改网格');
  table=table?{...table}:table;const plan=wordTableGridPlan(documents.bytes(s.documentId,s.revision).bytes,table,properties);
  async function check(){signal?.throwIfAborted();if(closed||sessions.get(id)!==s)throw Error('Office会话已关闭');current(s);if(sequence!==s.sequence||!selection||(await snap(s)).selection!==selection)throw Error('真实Word选区变化');const fresh=(await s.worker.request('table_context')).table;signal?.throwIfAborted();current(s);if(closed||sequence!==s.sequence||Date.now()-s.opened>30*60*1000)throw Error('网格编辑授权或选区已变化');if(!table?.fingerprint||!fresh||fresh.fingerprint!==table.fingerprint||fresh.rows!==table.rows||fresh.columns!==table.columns)throw Error('请选择完整单一Word表格，选区已变化');}
  await check();if(replacing)throw Error('另一份Office正在重载，请稍后重试');replacing=true;
  let dir,candidate,executionId;try{
   const edges=plan.grid.edges,edgeNames={top:'上边',start:'逻辑起边',bottom:'下边',end:'逻辑止边'};
   if(await approve(edges?'设置Word指定表格外边':'设置Word全部表格网格',`完整表格${table.rows}行×${table.columns}列；${edges?'仅整表'+edges.map(e=>edgeNames[e]).join('、')+'实线，其他外边和内部网格保留':'全部实线（含内部横竖线）'}${plan.grid.color} / ${plan.grid.width}pt。保留原文和内边距、保存新版本及前版。采用OOXML补丁并自动重载本窗口，当前原生撤销/重做栈将清空；不是原生UNO网格命令。`,signal)!==true)throw Error('表格网格未批准');
   await check();executionId=randomUUID();await audit({id:executionId,tool:'office_table_grid',status:'running',documentId:s.documentId,revision:s.revision,time:Date.now()});await check();
   dir=await mkdtemp(path.join(directory,'grid-'));await mkdir(path.join(dir,'profile/user'),{recursive:true,mode:0o700});await writeFile(path.join(dir,'profile/user/registrymodifications.xcu'),profile,{mode:0o600,flag:'wx'});const input=path.join(dir,'document.docx');await writeFile(input,plan.bytes,{mode:0o600,flag:'wx'});
   const init=new AbortController(),abort=()=>init.abort(signal?.aborted?signal.reason:lifecycle.signal.reason);signal?.addEventListener('abort',abort,{once:true});lifecycle.signal.addEventListener('abort',abort,{once:true});try{signal?.throwIfAborted();lifecycle.signal.throwIfAborted();candidate=await driver({...await runtime(),directory:dir,format:'docx',signal:init.signal});}finally{signal?.removeEventListener('abort',abort);lifecycle.signal.removeEventListener('abort',abort);}
   await snap({...s,worker:candidate,dir});await check();const stat=await lstat(input);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024**2)throw Error('网格私有候选文件无效');const h=await open(input,constants.O_RDONLY|constants.O_NOFOLLOW);try{plan.verify(await h.readFile());}finally{await h.close();}
   await check();const result=await documents.replaceBytes(s.documentId,s.revision,plan.bytes,signal,{nativeOffice:true,guard:()=>{if(closed||sessions.get(id)!==s||sequence!==s.sequence||Date.now()-s.opened>30*60*1000)throw Error('网格提交期间会话或许可变化');}});
   const old=s.worker,oldDir=s.dir;s.worker=candidate;s.dir=dir;s.revision=result.document.revision;s.sha256=result.document.sha256;s.sequence++;s.selection='';s.verifyOutput=null;s.dirty=false;candidate=null;dir=null;old.close();await rm(oldDir,{recursive:true,force:true}).catch(()=>{});notify();
   await audit({id:executionId,tool:'office_table_grid',status:'succeeded',documentId:s.documentId,revision:s.revision,sha256:s.sha256,time:Date.now()});return {status:'succeeded',...meta(s),historyReset:true};
  }catch(e){if(executionId)await audit({id:executionId,tool:'office_table_grid',status:'failed',documentId:s.documentId,revision:s.revision,time:Date.now()}).catch(()=>{});throw e;
  }finally{candidate?.close();if(dir)await rm(dir,{recursive:true,force:true}).catch(()=>{});replacing=false;}
 });},
 meta(id){return meta(find(id));},
 async discardDraft(id){const s=find(id);return locked(s,async()=>{
  if(!s.dirty)throw Error('当前没有未保存草稿');const sequence=s.sequence,revision=s.revision,sha256=s.sha256;
  if(await approve('放弃未保存的Office草稿',`${s.name} 当前尚未保存的修改将被丢弃，窗口将关闭。已保存的文档版本和历史版本保留。`)!==true)return {status:'denied'};
  current(s);if(sequence!==s.sequence||revision!==s.revision||sha256!==s.sha256)throw Error('文档状态已变化，请重新确认');
  await audit({id:randomUUID(),tool:'office_discard_draft',status:'approved',documentId:s.documentId,revision:s.revision,time:Date.now()});
  current(s);if(sequence!==s.sequence||revision!==s.revision||sha256!==s.sha256)throw Error('文档状态已变化，请重新确认');
  s.worker.close();sessions.delete(s.id);let timer;
  try{const stopped=await Promise.race([Promise.resolve(s.worker.closed).then(()=>true,()=>false),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),closeWaitMs);})]);if(!stopped)throw Error('Office worker did not stop');await removeOfficeTemp(s.dir,{recursive:true,force:true});return {status:'discarded'};}
  catch{await audit({id:randomUUID(),tool:'office_discard_cleanup',status:'failed',documentId:s.documentId,revision:s.revision,time:Date.now()}).catch(()=>{});return {status:'discarded',cleanupWarning:true};}
  finally{clearTimeout(timer);}
 });},
 async close(id,{discard=false}={}){const s=find(id);const p=s.queue.then(async()=>{if(sessions.get(id)!==s)return;if(s.dirty&&!discard)await save(s);s.worker.close();sessions.delete(id);await rm(s.dir,{recursive:true,force:true});});s.queue=p.catch(()=>{});return p;},
 prewarm,
 hasSpare:()=>!!spare,
 async shutdown(){closed=true;lifecycle.abort(Error('Office服务已关闭'));await warming?.catch(()=>{});await disposeSpare(takeSpare()).catch(()=>{});for(const s of sessions.values()){s.worker.close();await rm(s.dir,{recursive:true,force:true});}sessions.clear();}
 };
}
