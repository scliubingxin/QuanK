import path from 'node:path';import {stat,readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
/** Dedicated bridge: each exact main frame can access only its bound Office session. */
export function createOfficeWindows({BrowserWindow,ipcMain,here,kit,chat,models,documents,dialog}){
 const windows=new Map(),byDocument=new Map(),entry=path.join(here,'src/office/index.html'),url=pathToFileURL(entry).href;
 ipcMain.handle('willbuddy-office:invoke',async(event,op,p={})=>{const binding=windows.get(event.sender.id);if(!binding||event.sender!==binding.window.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!==url)throw Error('拒绝不可信Office页面');const {session,documentId}=binding;
  if(op==='info')return {...kit.meta(session),messages:chat.history(documentId),models:models.view()};
  if(op==='snapshot')return kit.snapshot(session,p);
  if(op==='operation')return kit.operation(session,p.op,p);
  if(op==='manualReplaceSelection')return kit.manualReplaceSelection(session,p);
  if(op==='manualUpdateCells')return kit.manualUpdateCells(session,p);
  if(op==='discardDraft'){const result=await kit.discardDraft(session);if(result.status==='discarded'){try{await chat.cancel(documentId);if(result.cleanupWarning&&dialog)await dialog.showMessageBox(binding.window,{type:'warning',message:'草稿已关闭，但临时文件清理失败',detail:'已保存的文档版本仍在。请检查应用的临时文件清理状态。',buttons:['知道了'],defaultId:0});}finally{binding.window.destroy();}}return result;}
  if(op==='pickImage'){// [lane:ribbon] controlled file channel: native dialog in main, bytes validated by kit.insertImage
   if(!dialog)throw Error('当前环境不支持选择图片');const r=await dialog.showOpenDialog(binding.window,{title:'插入图片',properties:['openFile'],filters:[{name:'图片',extensions:['png','jpg','jpeg']}]});if(r.canceled||!r.filePaths?.length)return {status:'cancelled'};
   const file=r.filePaths[0],st=await stat(file);if(!st.isFile()||st.size>4*1024**2)throw Error('图片不是普通文件或超过4MiB');return kit.insertImage(session,{name:path.basename(file),bytes:new Uint8Array(await readFile(file))});}
  if(op==='save')return kit.save(session);
  if(op==='docOutline')return kit.outline(session); // [docx]
  if(op==='thumbnail')return kit.thumbnail(session,p); // [lane:pages]
  if(op==='slideAction')return kit.slideAction(session,p); // [lane:pages]
  if(op==='notesGet')return kit.notesGet(session); // [lane:pages]
  if(op==='notesSet')return kit.notesSet(session,p); // [lane:pages]
  if(op==='deckInfo')return kit.deckInfo(session,p); // [lane:pages]
  if(op==='viewMode')return kit.viewMode(session,p); // [lane:pages]
  if(op==='chat')return chat.run(session,p);
  if(op==='cancel')return chat.cancel(documentId);
  throw Error('不支持的Office接口');
 });
 return {hasUnsaved(){return [...windows.values()].some(b=>{try{return kit.meta(b.session).dirty;}catch{return false;}});},async open(id,revision){const existing=byDocument.get(id);if(existing&&!existing.isDestroyed()){existing.show();existing.focus();return {status:'opened'};}
  // [p2-ux] show the editor window with a loading screen as soon as the user approves, while the engine starts
  const make=title=>new BrowserWindow({width:1440,height:960,minWidth:880,minHeight:600,title,icon:path.join(here,'assets/icon-512.png'),backgroundColor:'#FFFFFF',webPreferences:{preload:path.join(here,'office-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  let early=null;let s;
  try{s=await kit.open(id,revision,{onApproved:()=>{try{early=make('QuanK Office');early.webContents.setWindowOpenHandler(()=>({action:'deny'}));early.webContents.on('will-navigate',e=>e.preventDefault());early.loadFile(path.join(here,'src/office/loading.html')).catch(()=>{});}catch{early=null;}}});}
  catch(e){if(early&&!early.isDestroyed())early.destroy();throw e;}
  if(s.status==='denied'){if(early&&!early.isDestroyed())early.destroy();return s;}
  const w=early&&!early.isDestroyed()?early:make('QuanK Office · '+s.name);if(early){w.setTitle?.('QuanK Office · '+s.name);w.webContents.removeAllListeners?.('will-navigate');}const windowId=w.webContents.id;windows.set(windowId,{window:w,session:s.sessionId,documentId:id});byDocument.set(id,w);w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',(e,u)=>{if(u!==url)e.preventDefault();});let closing=false;w.on('close',e=>{if(closing)return;e.preventDefault();void chat.cancel(id).then(()=>kit.close(s.sessionId)).then(()=>{closing=true;w.close();}).catch(error=>{w.webContents.send('willbuddy-office:error',error.message);});});w.on('closed',()=>{windows.delete(windowId);byDocument.delete(id);});await w.loadFile(entry);return {status:'opened',id};},async close(){for(const {window} of windows.values())window.destroy();windows.clear();byDocument.clear();await kit.shutdown();}};
}
