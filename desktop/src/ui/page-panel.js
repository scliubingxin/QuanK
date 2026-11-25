import {mountOfficeAIMenu} from './office-ai-menu.js';
import {createOfficeToolbar} from './office-toolbar.js';
import {createFloatToolbar} from './office-float-toolbar.js';
import {docIcon} from './avatars.js';
// [v0.54] right-hand page tabs: pages opened from the chat, and every stock detail, open as tabs beside the
// conversation instead of replacing it. Pure helpers here; app.js owns the DOM host and the render loop.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export const PANEL_MAX_TABS = 8;
export const PANEL_MIN_WIDTH = 380;
// pages that never go to the panel: the chat itself and the 工作台 home with its own composer
export const MAIN_ONLY = new Set(['home', 'chat']);

export function pageTab(page, title = '') {
  return {id: 'page:' + page, kind: 'page', page: String(page), title: String(title || page)};
}
export function documentTab(documentId, title, format) {
  return {id: 'document:' + documentId, kind: 'document', documentId, title, format};
}

export function codingTaskTab(taskId, title = '编码任务') {
  return {id: 'coding-task:' + taskId, kind: 'coding-task', taskId, title};
}

export function stockTab(code, name = '', {section} = {}) {
  const c = String(code || '').trim();
  return {id: 'stock:' + c, kind: 'stock', page: 'quant', code: c, title: String(name || c), ...(section === 'graph' ? {section} : {})};
}

export function marketStockTab(code, name = '', period) {
  return {id: 'market-stock:' + code, kind: 'market-stock', page: 'market', code, title: String(name || code), period};
}

/** Open (or re-focus) a tab. The newest tab goes to the right; past `max` the oldest tab that is not the one
 * being opened is dropped. Returns {tabs, active}. */
export function openTab(tabs, tab, {max = PANEL_MAX_TABS} = {}) {
  const list = (Array.isArray(tabs) ? tabs : []).filter(t => t && t.id);
  const at = list.findIndex(t => t.id === tab.id);
  let next = at >= 0 ? list.map((t, i) => i === at ? {...t, ...tab, title: tab.title || t.title} : t) : [...list, tab];
  while (next.length > Math.max(1, max)) next = next.filter((t, i) => !(i === next.findIndex(x => x.id !== tab.id)));
  return {tabs: next, active: tab.id};
}

/** Close a tab; when it was the active one the neighbour on the right (else the left) becomes active. */
export function closeTab(tabs, id, active) {
  const list = Array.isArray(tabs) ? tabs : [];
  const at = list.findIndex(t => t.id === id);
  if (at < 0) return {tabs: list, active};
  const next = list.filter(t => t.id !== id);
  if (active !== id) return {tabs: next, active};
  return {tabs: next, active: (next[at] || next[at - 1])?.id || ''};
}

export function activeTab(tabs, active) {
  const list = Array.isArray(tabs) ? tabs : [];
  return list.find(t => t.id === active) || list.at(-1) || null;
}

/** Restore saved tabs (localStorage) defensively. */
export function restoreTabs(raw) {
  let v; try { v = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { v = null; }
  const tabs = (Array.isArray(v?.tabs) ? v.tabs : []).map(t => t?.kind === 'stock' && /^\d{6}$/.test(String(t.code || '')) ? stockTab(t.code, t.title)
    : t?.kind === 'market-stock' && /^\d{6}$/.test(String(t.code || '')) ? marketStockTab(t.code, t.title, t.period)
    : t?.kind === 'document' && typeof t.documentId === 'string' && t.documentId ? documentTab(t.documentId, String(t.title || ''), String(t.format || ''))
    : t?.kind === 'coding-task' && typeof t.taskId === 'string' && /^[\w-]+$/.test(t.taskId) ? codingTaskTab(t.taskId, String(t.title || '编码任务'))
    : t?.kind === 'page' && typeof t.page === 'string' && /^[a-z]+$/.test(t.page) && !MAIN_ONLY.has(t.page) ? pageTab(t.page, t.title) : null).filter(Boolean).slice(-PANEL_MAX_TABS);
  const width = Number(v?.width);
  return {tabs, active: tabs.some(t => t.id === v?.active) ? v.active : tabs.at(-1)?.id || '', wide: !!v?.wide, width: Number.isFinite(width) && width >= PANEL_MIN_WIDTH ? Math.round(width) : 0};
}

export function clampWidth(w, viewport) {
  const vw = Number(viewport) || 1440, max = Math.max(PANEL_MIN_WIDTH, vw - 760); // keep the sidebar + ~520px of chat
  const x = Number(w) || Math.round(vw * 0.46);
  return Math.round(Math.min(max, Math.max(PANEL_MIN_WIDTH, x)));
}

/** Header: tab strip + controls. `icon` is the app's icon() helper. */
export function panelHead({tabs, active, wide = false, icon = () => ''}) {
  const strip = tabs.map(t => `<div class="pp-tab ${t.id === active ? 'selected' : ''} pp-${t.kind}" title="${esc(t.title)}${t.kind === 'stock' ? ' ' + esc(t.code) : ''}"><button type="button" role="tab" aria-selected="${t.id === active}" data-action="ppSelect" data-id="${esc(t.id)}">${t.kind === 'stock' ? '<span class="pp-dot" aria-hidden="true"></span>' : t.kind === 'document' ? docIcon(t.format, 'file-type lib-icon ' + esc(t.format)) : icon('grid')}<span>${esc(t.title)}</span>${t.kind === 'stock' && t.title !== t.code ? `<small>${esc(t.code)}</small>` : ''}</button><button type="button" class="pp-x" data-action="ppClose" data-id="${esc(t.id)}" aria-label="关闭 ${esc(t.title)}">×</button></div>`).join('');
  return `<div class="pp-tabs" role="tablist" aria-label="打开的页面">${strip}</div><div class="pp-tools"><button type="button" class="icon-button" data-action="ppMain" title="在主区域打开" aria-label="在主区域打开">↙</button><button type="button" class="icon-button" data-action="ppWide" aria-pressed="${wide}" title="${wide ? '还原' : '放大'}" aria-label="${wide ? '还原' : '放大'}">${wide ? '⤡' : '⤢'}</button><button type="button" class="icon-button" data-action="ppCloseAll" title="关闭全部页签" aria-label="关闭全部页签">${icon('close') || '×'}</button></div>`;
}

export function panelBusy(tab) {
  return `<div class="pp-same"><h3>${esc(tab.title)}</h3><p>这个页面正在左侧主区域显示。</p><button type="button" class="secondary" data-action="ppClose" data-id="${esc(tab.id)}">关闭这个页签</button></div>`;
}

export function showOfficeDecision(host, title, options, choose) {
  host.querySelector('.qk-office-decision')?.remove();
  const card = document.createElement('div');
  card.className = 'inline-approval-card qk-office-decision';
  card.setAttribute('role', 'alert');
  const label = document.createElement('strong');
  label.textContent = title;
  const actions = document.createElement('div');
  actions.className = 'inline-approval-actions';
  for (const [value, text, primary] of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.className = primary ? 'primary' : 'secondary';
    button.addEventListener('click', async () => {
      for (const child of actions.children) child.disabled = true;
      try {
        if (await choose(value) !== false) card.remove();
      } catch (error) {
        label.textContent = error.message;
      } finally {
        for (const child of actions.children) child.disabled = false;
      }
    });
    actions.append(button);
  }
  card.append(label, actions);
  host.prepend(card);
  return card;
}

/** Called by the workbench when mounting an Office document tab. */
export function mountPanelOffice({
  host, preview, status, menu, attachView, closeView, openWindow, readonlyPreview, previewScroll, ai, openCopy,
}) {
  let disposed = false, canvas, attached, toolbar, float, aiMenu, cancelApply, retry;
  const subscriptions = [];
  const item = document.createElement('button');
  item.type = 'button';
  item.textContent = '在独立窗口打开';
  item.addEventListener('click', openWindow);
  menu.append(item);
  host.style.position = 'relative';
  status.textContent = '只读';
  let pendingLocation;
  const locate = event => {
    pendingLocation = event.detail;
    if (canvas) void canvas.firstPaint.then(ready => {
      if (ready && !disposed && pendingLocation) {
        const target = pendingLocation;
        pendingLocation = undefined;
        return canvas.locate(target);
      }
    }).catch(report);
  };
  host.addEventListener('office-locate', locate);
  const reportCommand = event => report(event.detail);
  host.addEventListener('office-command-error', reportCommand);
  const position = previewScroll?.() ?? {top:preview.scrollTop,left:preview.scrollLeft};
  async function start() {
    const {mountOfficeCanvas} = await import('../office/office-canvas.js');
    const view = await attachView();
    if (disposed) {
      await closeView(view);
      return;
    }
    attached = view;
    const update = () => {
      status.textContent = view.session.state.get('saving')?.checked ? '保存中' : view.session.readOnly ? '只读' : '可编辑';
      status.title = view.readOnlyReason ?? '';
    };
    subscriptions.push(view.session.on('state',update));
    const showConflict = () => showOfficeDecision(host, '文档已有新版本', [
      ['copy','另存副本',true], ['reload','重新载入'], ['overwrite','覆盖'],
    ], async choice => (await view.session.resolveConflict(choice)).ok);
    subscriptions.push(view.session.on('conflict',showConflict));
    subscriptions.push(view.session.on('saved',detail => { if (detail?.copyId) openCopy?.(detail.copyId); }));
    if (view.saveState === 'conflict') showConflict();
    if (view.recovery) showOfficeDecision(host, '恢复未保存的修改', [
      ['restore','恢复',true], ['discard','放弃'],
    ], choice => view.session.resolveRecovery(choice));
    const current = previewScroll?.() ?? {top:preview.scrollTop,left:preview.scrollLeft};
    let metadata = view.metadata;
    if (view.session.kind === 'impress' && current.part > 0 && current.part < metadata.parts.length) {
      metadata = await view.request('part',{part:current.part});
      if (disposed) return;
    }
    const zoom = current.width > 0 ? current.width * 15 / metadata.width : current.zoom ?? position.zoom;
    const top = view.session.kind === 'impress' ? current.within ?? 0 : current.top;
    canvas = mountOfficeCanvas(host,{...view,metadata,preview:readonlyPreview,initialScroll:{top,left:current.left},
      initialZoom:zoom,onError:report});
    canvas.element.style.visibility = 'hidden';
    canvas.element.style.position = 'absolute';
    canvas.element.style.inset = '0';
    subscriptions.push(view.session.on('closed',() => {
      cancelApply?.();
      aiMenu?.destroy();
      toolbar?.destroy();
      float?.destroy();
      canvas.destroy();
      canvas = toolbar = float = aiMenu = attached = undefined;
      for (const off of subscriptions.splice(0)) off?.();
      host.querySelector('.qk-office-decision')?.remove();
      preview.hidden = false;
      status.textContent = '只读';
      status.title = '编辑引擎已退出，正在重新连接';
      if (!disposed) retry = setTimeout(() => void start().catch(report), 250);
    }));
    if (await canvas.firstPaint && !disposed && attached === view) {
      preview.hidden = true;
      canvas.element.style.visibility = '';
      canvas.element.style.position = '';
      canvas.element.style.inset = '';
      canvas.element.style.flex = '1';
      canvas.element.style.minWidth = '0';
      for (const node of host.parentElement.querySelectorAll('.file-preview-toolbar,.file-preview-status,.file-outline,.file-outline-handle')) {
        node.hidden = true;
      }
      toolbar = createOfficeToolbar(view.session, view.session.kind, {native:true});
      float = createFloatToolbar(view.session, {viewport:canvas.viewport});
      toolbar.element.querySelector('.qk-office-toolbar-header').append(canvas.zoomControl);
      canvas.element.prepend(toolbar.element);
      canvas.element.append(float.element);
      if (ai) aiMenu = mountOfficeAIMenu({
        session:view.session, floatToolbar:float, ai, root:host, input:canvas.input, allowChart:false,
        confirmApply:panel => new Promise(resolve => {
          const finish = allowed => { cancelApply = undefined; resolve(allowed); };
          const card = showOfficeDecision(panel, '允许 AI 将这项修改写入文档？', [
            ['allow','允许写入',true], ['deny','拒绝'],
          ], choice => finish(choice === 'allow'));
          cancelApply = () => { card.remove(); finish(false); };
        }),
      });
      toolbar.refresh();
      float.refresh();
      update();
      if (pendingLocation) locate({detail:pendingLocation});
    }
  }
  void start().catch(report);
  function report(error) {
    if (!disposed) status.title = error.message;
  }
  return () => {
    disposed = true;
    item.remove();
    host.removeEventListener('office-locate', locate);
    host.removeEventListener('office-command-error', reportCommand);
    clearTimeout(retry);
    cancelApply?.();
    aiMenu?.destroy();
    toolbar?.destroy();
    float?.destroy();
    canvas?.destroy();
    preview.hidden = false;
    for (const off of subscriptions) off?.();
    if (attached) void Promise.resolve(closeView(attached)).catch(report);
  };
}
