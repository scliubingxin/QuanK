import path from 'node:path';import {stat,readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
/** Dedicated bridge: each exact main frame can access only its bound Office session. */
export function createOfficeWindows({BrowserWindow,ipcMain,here,kit,chat,models,documents,dialog,notice=()=>{},canOpen=()=>true}){
 const windows=new Map(),byDocument=new Map(),entry=path.join(here,'src/office/index.html'),url=pathToFileURL(entry).href;
 ipcMain.handle('willbuddy-office:invoke',async(event,op,p={})=>{const binding=windows.get(event.sender.id);if(!binding||event.sender!==binding.window.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!==url)throw Error('拒绝不可信Office页面');const {session,documentId}=binding;
  if(op==='info')return {...kit.meta(session),messages:chat.history(documentId),models:models.view()};
  if(op==='snapshot')return kit.snapshot(session,p);
  if(op==='operation')return kit.operation(session,p.op,p);
  if(op==='manualReplaceSelection')return kit.manualReplaceSelection(session,p);
  if(op==='manualUpdateCells')return kit.manualUpdateCells(session,p);
  if(op==='discardDraft'){const result=await kit.discardDraft(session);if(result.status==='discarded'){try{await chat.cancel(documentId);if(result.cleanupWarning)notice('草稿已关闭，但临时文件清理失败。已保存的文档版本仍在。');}finally{binding.window.destroy();}}return result;}
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
 const loadingEntry = path.join(here, 'src/office/loading.html');
 const loadingUrl = pathToFileURL(loadingEntry).href;
 const pendingLoads = new Map(), openingRequests = new Map();
 ipcMain.handle('willbuddy-office:loading', (event, op) => {
  const loading = pendingLoads.get(event.sender.id);
  if (!loading || event.sender !== loading.window.webContents ||
      event.senderFrame !== event.sender.mainFrame ||
      event.senderFrame.url.split('#')[0] !== loadingUrl) throw Error('拒绝不可信Office页面');
  if (!canOpen()) throw Error('QuanK 已锁定，请先解锁');
  if (op === 'retry' && loading.retry) return loading.retry();
  throw Error('不支持的Office载入接口');
 });
 function makeWindow(id) {
  const w = new BrowserWindow({
   width:1440,height:960,minWidth:880,minHeight:600,show:false,title:'QuanK Office',
   icon:path.join(here,'assets/icon-512.png'),backgroundColor:'#FFFFFF',
   webPreferences:{preload:path.join(here,'office-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}
  });
  const windowId = w.webContents.id;
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  w.webContents.on('will-navigate', (event, target) => {
   if (target !== url && target.split('#')[0] !== loadingUrl) event.preventDefault();
  });
  byDocument.set(id, w);
  w.on('closed', () => {
   windows.delete(windowId);
   pendingLoads.delete(windowId);
   if (byDocument.get(id) === w) byDocument.delete(id);
  });
  return w;
 }
 const reveal = w => { if (w.isMinimized?.()) w.restore(); w.show(); w.focus(); };
 function open(id, revision, retryWindow) {
  const pending = openingRequests.get(id);
  if (!retryWindow && pending) return pending;
  const result = openWindow(id, revision, retryWindow);
  openingRequests.set(id, result);
  const forget = () => { if (openingRequests.get(id) === result) openingRequests.delete(id); };
  void result.then(forget, forget);
  return result;
 }
 async function openWindow(id, revision, retryWindow) {
  const existing = byDocument.get(id);
  if (!retryWindow && existing && !existing.isDestroyed()) {
   reveal(existing);
   return {status:'opened',id};
  }
  let w = retryWindow, onShow = Promise.resolve(), showResolve;
  const shown = new Promise(resolve => { showResolve = resolve; });
  const displayLoading = async () => {
   w ??= makeWindow(id);
   pendingLoads.set(w.webContents.id, {window:w});
   await w.loadFile(loadingEntry);
   if (w.isDestroyed()) return;
   reveal(w);
   if (w.isVisible?.() === false) throw Error('Office 窗口未能显示');
   showResolve({status:'opened',id});
  };
  const load = (async () => {
   let session;
   try {
    const result = await kit.open(id, revision, {onApproved: () => {
     onShow = displayLoading();
     void onShow.catch(()=>{});
    }});
    if (result.status === 'denied') {
     if (retryWindow && !retryWindow.isDestroyed()) retryWindow.destroy();
     return result;
    }
    session = result.sessionId;
    await onShow;
    if (w?.isDestroyed()) return {status:'closed'};
    w ??= makeWindow(id);
    const windowId = w.webContents.id;
    pendingLoads.delete(windowId);
    windows.set(windowId, {window:w,session,documentId:id});
    w.setTitle?.('QuanK Office · '+result.name);
    await w.loadFile(entry);
    if (!w.isVisible?.() && !retryWindow) reveal(w);
    let closing = false;
    w.on('close', event => {
     if (closing) return;
     event.preventDefault();
     void chat.cancel(id).then(()=>kit.close(result.sessionId)).then(()=>{
      closing = true;
      w.close();
     }).catch(error=>w.webContents.send('willbuddy-office:error',error.message));
    });
    session = undefined;
    return {status:'opened',id};
   } catch (error) {
    if (!w || w.isDestroyed()) throw error;
    await onShow.catch(()=>{});
    if (w.isDestroyed()) throw error;
    windows.delete(w.webContents.id);
    if (session) { await kit.close(session).catch(()=>{}); session = undefined; }
    pendingLoads.set(w.webContents.id, {window:w,retry:()=>{
     pendingLoads.get(w.webContents.id).retry = undefined;
     return open(id, revision, w);
    }});
    await w.loadFile(loadingEntry, {hash:'error'});
    reveal(w);
    return {status:'failed'};
   } finally {
    if (session) await kit.close(session).catch(()=>{});
   }
  })();
  return Promise.race([shown, load]);
 }
 return {
  open,
  hasUnsaved(){return [...windows.values()].some(b=>{try{return kit.meta(b.session).dirty;}catch{return false;}});},
  async close(){for(const window of byDocument.values())window.destroy();windows.clear();pendingLoads.clear();byDocument.clear();await kit.shutdown();}
 };
}
