// v0.58.1 dedicated edit window: the v0.58.0 in-tab editor, moved into its own
// BrowserWindow. Same O1 canvas/session, O2 chrome, O3 AI, O5 save cards.
import {connectOfficeViewPort, mountOfficeCanvas} from './office-canvas.js';
import {createOfficeToolbar} from '../ui/office-toolbar.js';
import {createFloatToolbar} from '../ui/office-float-toolbar.js';
import {mountOfficeAIMenu} from '../ui/office-ai-menu.js';
import {showOfficeDecision} from '../ui/page-panel.js';

const params = new URLSearchParams(location.search);
const id = params.get('doc') || '';
const revision = Number(params.get('rev')) || undefined;
const timeout = Math.max(1000, Math.min(180_000, Number(params.get('timeout')) || 30_000));
let target;
try { target = JSON.parse(params.get('target') || 'null'); } catch { target = null; }

const editor = document.getElementById('qk-editor');
const loading = document.getElementById('qk-loading');
const retryButton = document.getElementById('qk-retry');
const legacyButton = document.getElementById('qk-legacy');
const cards = document.getElementById('qk-cards');
const api = window.actwill;
let disposed = false, canvas, toolbar, float, aiMenu, cancelApply, retry;
const log = () => {};

function fail(error) {
  if (disposed) return;
  loading.hidden = false;
  loading.querySelector('b').textContent = '未能载入 Office 编辑器';
  loading.querySelector('small').textContent = String(error?.message || error || '引擎启动失败');
  retryButton.hidden = false;
  legacyButton.hidden = false;
  void api.officeWindowEvent({id, type:'error', value:String(error?.message || error)}).catch(log);
}

function decision(title, options, choose) {
  return showOfficeDecision(cards, title, options, choose);
}

async function stateInfo() {
  try { return await api.state(); } catch { return {}; }
}

function makeAI(state) {
  const blocked = () => {
    if (state?.locked || state?.security?.encrypted) return '已开启文档加密或工作区已锁定。';
    if (state?.security?.privacy?.offline) return '已开启离线模式，选区 AI 已禁用。';
    if (state?.settings?.office?.ai?.allowUpload === false) return '「不上传文档」策略已启用，选区 AI 已禁用。';
    return '';
  };
  return {
    blockReason: blocked,
    async run(input, {signal, onDelta}) {
      signal.throwIfAborted();
      const token = crypto.randomUUID();
      const off = api.onOfficeAIDelta(event => { if (event.token === token && !signal.aborted) onDelta?.(event.delta); });
      const cancel = () => { void api.officeAI({token, cancel:true}).catch(log); };
      signal.addEventListener('abort', cancel, {once:true});
      try { return await api.officeAI({token, input}); }
      finally { off(); signal.removeEventListener('abort', cancel); }
    },
  };
}

async function start() {
  const state = await stateInfo();
  const name = state?.documents?.find(item => item.id === id)?.name || '文档';
  const documentName = name + '.' + (state?.documents?.find(item => item.id === id)?.format || '');
  const head = document.createElement('header');
  head.className = 'qk-win-head';
  const title = document.createElement('b');
  title.textContent = documentName;
  title.title = documentName;
  const status = document.createElement('output');
  status.textContent = '正在连接编辑引擎…';
  // Native macOS traffic lights own closing; main.js runs the O5 exit card.
  head.append(title, status);
  editor.append(head);

  const token = crypto.randomUUID();
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(Error('编辑窗口连接超时')); }, timeout);
    function cleanup() { clearTimeout(timer); removeEventListener('message', receive); }
    function receive(event) {
      if (event.source !== window || event.data?.kind !== 'quank-office-port' || event.data.token !== token || !event.ports[0]) return;
      cleanup();
      resolve(event.ports[0]);
    }
    addEventListener('message', receive);
    api.officeWindowAttach({id, revision, token}).catch(error => { cleanup(); reject(error); });
  });
  if (disposed) return;
  const view = await connectOfficeViewPort(port);
  if (disposed) return;
  const host = document.createElement('div');
  host.style.cssText = 'flex:1;min-height:0;position:relative;display:flex';
  editor.append(host);
  canvas = mountOfficeCanvas(host, {...view, onError:fail});
  const ok = await Promise.race([canvas.firstPaint,
    new Promise(resolve => setTimeout(() => resolve(false), timeout))]);
  if (disposed) return;
  if (!ok) throw Error('编辑画布未能完成首次绘制');

  toolbar = createOfficeToolbar(view.session, view.session.kind, {native:true});
  float = createFloatToolbar(view.session, {viewport:canvas.viewport});
  toolbar.element.querySelector('.qk-office-toolbar-header')?.append(canvas.zoomControl);
  canvas.element.prepend(toolbar.element);
  canvas.element.append(float.element);
  aiMenu = mountOfficeAIMenu({
    session:view.session, floatToolbar:float, ai:makeAI(state), root:cards, input:canvas.input,
    allowChart:true,
    confirmApply:panel => new Promise(resolve => {
      const finish = allowed => { cancelApply = undefined; resolve(allowed); };
      const card = decision(panel, '允许 AI 将这项修改写入文档？', [
        ['allow','允许写入',true], ['deny','拒绝'],
      ], choice => finish(choice === 'allow'));
      cancelApply = () => { card.remove(); finish(false); };
    }),
  });
  toolbar.refresh();
  float.refresh();
  let dirty = false;
  let savedAt = Date.now();
  const clock = new Intl.DateTimeFormat('zh-CN', {hour:'2-digit', minute:'2-digit', hour12:false});
  const updateStatus = () => {
    const saving = view.session.state.get('saving')?.checked;
    status.textContent = saving ? '保存中…' : dirty ? '未保存' :
      '已保存 · ' + clock.format(new Date(savedAt));
  };
  view.session.on('state', updateStatus);
  view.session.on('dirty', () => {
    dirty = true; updateStatus();
    void api.officeWindowEvent({id, type:'dirty', value:true}).catch(log);
  });
  view.session.on('saving', () => updateStatus());
  view.session.on('saved', detail => {
    dirty = false; savedAt = detail?.at || Date.now(); updateStatus();
    void api.officeWindowEvent({id, type:'saved', value:detail}).catch(log);
  });
  view.session.on('conflict', () => decision(cards, '文档已有新版本', [
    ['copy','另存副本',true], ['reload','重新载入'], ['overwrite','覆盖'],
  ], async choice => (await view.session.resolveConflict(choice)).ok));
  if (view.saveState === 'conflict') {
    decision(cards, '文档已有新版本', [['copy','另存副本',true],['reload','重新载入'],['overwrite','覆盖']],
      async choice => (await view.session.resolveConflict(choice)).ok);
  }
  if (view.recovery) {
    decision(cards, '恢复未保存的修改', [['restore','恢复',true],['discard','放弃']],
      choice => view.session.resolveRecovery(choice));
  }
  view.session.on('closed', () => {
    void api.officeWindowEvent({id, type:'close'}).catch(log);
    fail(Error('编辑会话已结束，可重试重新连接'));
  });
  view.session.on('error', error => void api.officeWindowEvent({id, type:'error', value:error.message}).catch(log));
  updateStatus();
  if (target) void canvas.locate(target).catch(log);
  loading.hidden = true;
  void api.officeWindowEvent({id, type:'ready'}).catch(log);
}

api.onOfficeWindowPrompt?.(payload => {
  decision(cards, payload?.card?.message || '有未保存修改', [
    ['save','保存并关闭',true], ['discard','放弃修改'], ['cancel','取消'],
  ], async choice => {
    await api.officeWindowDecision({token:payload.token, choice});
    return true;
  });
});

retryButton.addEventListener('click', () => {
  retryButton.disabled = true;
  void api.officeWindowRetry().catch(error => {
    retryButton.disabled = false;
    loading.querySelector('small').textContent = error.message;
  });
});
legacyButton.addEventListener('click', () => {
  void api.officeLegacyOpen({id, revision}).catch(error => {
    retryButton.hidden = false;
    loading.querySelector('small').textContent = error.message;
  });
});

void start().catch(fail);
