import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {bindOfficeViewPort} from '../services/office-session.mjs';

/**
 * v0.58.1: the dedicated edit window runs the same O1 session / O2 chrome /
 * O3 AI / O5 save controller as the old v0.58.0 in-tab editor. It never asks
 * for an "open" authorization: the session manager resolves authorized bytes
 * from the result centre itself. The legacy src/office/index.html editor is
 * left in place as a fallback only (see src/office/window.js).
 */
/** All BrowserWindow access is best-effort: a destroyed window or a test
 * double missing a method must never abort main-process startup. */
function safe(target, method, ...args) {
  if (!target || typeof target[method] !== 'function') return undefined;
  if (typeof target.isDestroyed === 'function' && target.isDestroyed()) return undefined;
  try { return target[method](...args); } catch { return undefined; }
}

export function createOfficeEditWindows({
  BrowserWindow, ipcMain, here, sessions, documents, onEvent = () => {}, canOpen = () => true,
}) {
  const windows = new Map();      // webContents.id -> binding
  const byDocument = new Map();   // docId -> BrowserWindow
  const opening = new Map();      // docId -> Promise
  const closing = new Set();      // webContents.id being destroyed
  const decisions = new Map();    // token -> resolve(choice)
  const entry = path.join(here, 'src/office/window.html');
  const url = pathToFileURL(entry).href;

  const frameOf = event => event?.senderFrame && event.senderFrame === event.sender?.mainFrame;
  function bindingOf(event) {
    const binding = windows.get(event?.sender?.id);
    if (!binding || !frameOf(event)) return undefined;
    const frameUrl = String(event.senderFrame.url || '').split(/[?#]/)[0];
    if (frameUrl !== url) return undefined;
    return binding;
  }

  ipcMain.handle('willbuddy-office-window:attach', async (event, payload) => {
    const binding = bindingOf(event);
    if (!binding) throw Error('拒绝不可信 Office 编辑窗口');
    if (!canOpen()) throw Error('QuanK 已锁定，请先解锁');
    const id = binding.docId, revision = binding.revision;
    if (typeof payload?.token !== 'string' || !/^[a-f0-9-]{36}$/.test(payload.token)) throw Error('Office 窗口标识无效');
    const manager = await sessions();
    if (!manager) throw Error('Office 编辑引擎未就绪');
    const view = await manager.open({documentId:id, mode:'edit', ...(Number.isFinite(revision) ? {revision} : {})});
    binding.view = view;
    binding.closeView = () => manager.closeView(view);
    const {port1, port2} = new MessageChannelMain();
    binding.dispose = bindOfficeViewPort(port1, view, binding.closeView, () => bindingOf(event) === binding);
    binding.off = [
      view.session.on('saved', detail => onEvent(id, 'saved', detail)),
      view.session.on('dirty', () => onEvent(id, 'dirty', {dirty:true})),
      view.session.on('state', state => {
        if ('saving' in state) binding.saving = state.saving === 'true' || state.saving === true;
      }),
      view.session.on('closed', () => onEvent(id, 'closed')),
    ];
    try { event.senderFrame.postMessage('actwill:officePort', payload.token, [port2]); }
    catch (error) { binding.dispose?.(); port2.close(); throw error; }
    onEvent(id, 'open', {kind:view.session.kind});
    return {status:'ready', kind:view.session.kind, readOnly:view.session.readOnly,
      readOnlyReason:view.readOnlyReason, recovery:view.controller?.recovery, saveState:view.controller?.state?.status};
  });

  ipcMain.handle('willbuddy-office-window:event', async (event, payload) => {
    const binding = bindingOf(event);
    if (!binding) throw Error('拒绝不可信 Office 编辑窗口');
    const {type, value} = payload || {};
    if (type === 'dirty') binding.dirty = Boolean(value);
    else if (type === 'error') onEvent(binding.docId, 'error', {message:String(value || '')});
    else onEvent(binding.docId, type, value);
    return true;
  });

  ipcMain.handle('willbuddy-office-window:decision', async (event, payload) => {
    const binding = bindingOf(event);
    if (!binding) throw Error('拒绝不可信 Office 编辑窗口');
    const resolve = decisions.get(payload?.token);
    if (!resolve) throw Error('退出确认已失效');
    decisions.delete(payload.token);
    return resolve(['save','discard','cancel'].includes(payload?.choice) ? payload.choice : 'cancel');
  });

  ipcMain.handle('willbuddy-office-window:retry', async event => {
    const binding = bindingOf(event);
    if (!binding || safe(binding.window, 'isDestroyed')) throw Error('Office 编辑窗口已关闭');
    binding.dispose?.();
    binding.off?.forEach(off => off?.());
    binding.view = undefined;
    binding.dispose = undefined;
    binding.off = undefined;
    binding.dirty = false;
    await safe(binding.window, 'loadURL', binding.loadUrl);
    return true;
  });

  function dynamicTimeout(id, revision) {
    let size = 0;
    try { size = documents?.bytes?.(id, revision)?.bytes?.byteLength || 0; } catch {}
    return Math.min(180_000, 60_000 + Math.max(0, Math.ceil(size / 1_048_576) - 1) * 15_000);
  }

  async function create(id, revision, target) {
    let documentName = 'QuanK Office';
    try {
      const entry = documents?.read?.(id);
      if (entry?.name) documentName = entry.name + '.' + entry.format;
    } catch {}
    const w = new BrowserWindow({
      width:1360, height:900, minWidth:900, minHeight:620, show:false,
      // v0.58.1 review A2: macOS native title bar with traffic lights; closing
      // goes through the O5 exit-protection card in w.on('close') below.
      title:documentName, titleBarStyle:'hiddenInset',
      ...(process.platform === 'darwin' ? {trafficLightPosition:{x:18,y:16}} : {}),
      icon:path.join(here,'assets/icon-512.png'), backgroundColor:'#FFFFFF',
      webPreferences:{preload:path.join(here,'preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:true},
    });
    const wcId = w.webContents.id;
    safe(w.webContents, 'setWindowOpenHandler', () => ({action:'deny'}));
    safe(w.webContents, 'on', 'will-navigate', (event, next) => {
      if (next.split(/[?#]/)[0] !== url) event.preventDefault();
    });
    const query = new URLSearchParams({doc:id, rev:String(revision ?? ''), timeout:String(dynamicTimeout(id, revision))});
    if (target) query.set('target', JSON.stringify(target).slice(0, 20000));
    const loadUrl = url + '?' + query.toString();
    const binding = {window:w, docId:id, revision, loadUrl, dirty:false, saving:false};
    windows.set(wcId, binding);
    byDocument.set(id, w);
    safe(w, 'on', 'closed', () => {
      windows.delete(wcId);
      closing.delete(wcId);
      if (byDocument.get(id) === w) byDocument.delete(id);
      try {
        binding.dispose?.();
        binding.off?.forEach(off => off?.());
      } catch {}
      onEvent(id, 'close');
    });
    safe(w, 'on', 'close', event => {
      if (closing.has(wcId)) return;
      event.preventDefault();
      if (!binding.dirty || !binding.view) { closing.add(wcId); safe(w, 'destroy'); return; }
      // O5 exit protection card: rendered inside the edit window, never a native dialog.
      const token = randomUUID();
      const done = resolve => {
        decisions.delete(token);
        void (async () => {
          try {
            if (resolve === 'save') await binding.view?.session?.save({reason:'manual'});
            if (resolve === 'discard') await binding.view?.session?.reload();
          } catch (error) { onEvent(id, 'error', {message:error.message}); return; }
          closing.add(wcId);
          safe(w, 'destroy');
        })();
      };
      decisions.set(token, done);
      safe(w.webContents, 'send', 'willbuddy-office-window:closePrompt', {token, card:{message:'有未保存修改', choices:['save','discard','cancel']}});
    });
    await safe(w, 'loadURL', loadUrl);
    if (safe(w, 'isDestroyed')) throw Error('Office 编辑窗口已关闭');
    if (safe(w, 'isMinimized')) safe(w, 'restore');
    safe(w, 'show');
    safe(w, 'focus');
    if (safe(w, 'isVisible') === false) throw Error('Office 编辑窗口未能显示');
    safe(w, 'setTitle', documentName);
    return {status:'opened', id};
  }

  function open(id, revision, target) {
    if (!id) return Promise.reject(Error('文档标识无效'));
    const existing = byDocument.get(id);
    if (existing && safe(existing, 'isDestroyed') !== true) {
      if (safe(existing, 'isMinimized')) safe(existing, 'restore');
      safe(existing, 'show');
      safe(existing, 'focus');
      return Promise.resolve({status:'opened', id, existing:true});
    }
    if (opening.has(id)) return opening.get(id);
    const result = create(id, revision, target);
    opening.set(id, result);
    const forget = () => { if (opening.get(id) === result) opening.delete(id); };
    void result.then(forget, forget);
    return result;
  }

  function hasUnsaved() { return [...windows.values()].some(binding => binding.dirty); }
  async function close() {
    closing.clear();
    for (const w of byDocument.values()) safe(w, 'destroy');
    byDocument.clear(); windows.clear(); opening.clear(); decisions.clear();
  }
  return {open, hasUnsaved, close, frameBinding:event => bindingOf(event)};
}
