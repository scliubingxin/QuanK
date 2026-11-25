// [p4-m4] 创作 · 小应用: list, viewer, forms, the sandbox bridge and ```miniapp blocks in chat replies (renderer only).
import { escape } from './markdown.js';
import { HTML_BYTES } from '../shared/miniapp.js';
import { STUDIO_TABS } from './dashboard.js';

// modal handlers receive FormData; tests may pass a form-like object
const val = (f, n) => String((typeof f?.get === 'function' ? f.get(n) : f?.elements?.[n]?.value ?? f?.[n]?.value) ?? '');
const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

export function miniappPage(state, {action, heading, empty, date, tab = 'miniapps', open = ''}) {
  const tabs = `<div class="feed-filters studio-tabs" role="tablist">${STUDIO_TABS.map(([id, label]) => `<button type="button" role="tab" aria-selected="${id === tab}" class="${id === tab ? 'chosen' : ''}" data-action="studioTab" data-id="${id}">${label}</button>`).join('')}</div>`;
  const list = state.miniapps || [];
  const current = open && list.find(a => a.id === open);
  if (current) {
    return `<div class="page miniapp-view"><div class="miniapp-bar">${action('← 全部小应用', 'miniappClose', '')}<h2>${escape(current.name)}</h2><small>${current.versions ? `第 ${current.versions + 1} 版 · ` : ''}${current.dataItems} 项数据 · 更新于 ${escape(date(current.updated))}</small>
<span class="miniapp-tools">${action('修改这个应用', 'miniappRevise', current.id, 'primary')}${action('版本', 'miniappVersions', current.id)}${action('重新载入', 'miniappReload', current.id)}${action('清空数据', 'miniappReset', current.id)}${action('导出 HTML', 'miniappExport', current.id)}</span></div>
<p class="miniapp-note" id="miniappNote" hidden></p><div id="miniappHost" class="miniapp-host" data-id="${escape(current.id)}"></div></div>`;
  }
  const cards = list.map(a => `<div class="card miniapp-card"><div class="graph-head"><h3>${escape(a.name)}</h3><span class="graph-type" style="--c:#0078CB">${a.versions ? `v${a.versions + 1}` : 'v1'}</span></div>
<small class="graph-alias">${kb(a.bytes)} · ${a.dataItems} 项数据 · 更新于 ${escape(date(a.updated))}</small>${a.note ? `<p class="miniapp-last">${escape(a.note)}</p>` : ''}
<div class="actions">${action('打开', 'miniappOpen', a.id, 'primary')}${action('修改', 'miniappRevise', a.id)}${action('版本', 'miniappVersions', a.id)}${action('重命名', 'miniappRename', a.id)}${action('复制', 'miniappCopy', a.id)}${action('删除', 'miniappRemove', a.id)}</div></div>`).join('');
  const head = heading('', '小应用', '一句话做一个能用的小工具：记账本、打卡表、报价计算器、会议计时器……也可以在对话里说「帮我做一个小工具」。小应用在隔离环境里运行，不联网、不能访问你的文件，数据只保存在本机。', action('＋ 新建小应用', 'miniappNew', '', 'primary'));
  return `<div class="page">${head}${tabs}${list.length ? `<div class="cards">${cards}</div>` : empty('还没有小应用', '点「新建小应用」描述想要的工具，或在对话里让 QuankSight 帮你做一个。')}</div>`;
}

export function miniappForm(prompt = '') {
  return `<label>想做一个什么样的小工具<textarea name="prompt" rows="6" required placeholder="例如：团队周报打卡表——每人每周勾选是否已交，显示本周完成率，可以添加或删除成员，数据自动保存">${escape(prompt)}</textarea></label>
<label>名称（可留空）<input name="name" maxlength="60"></label><p class="hint">会把你的描述发给已配置的模型生成代码，大约需要 20–60 秒。</p>`;
}
export function miniappPayload(f) {
  const prompt = val(f, 'prompt').trim();
  if (prompt.length < 4) throw new Error('请描述想要的小应用');
  return {action: 'create', prompt: prompt.slice(0, 4000), name: val(f, 'name').trim()};
}
export const miniappReviseForm = () => `<label>要怎么修改<textarea name="instruction" rows="5" required placeholder="例如：加一个按月筛选；导出按钮改成复制到剪贴板；配色改成深色"></textarea></label><p class="hint">已保存的数据会保留；修改前的代码会存为历史版本，可以随时恢复。</p>`;
export function miniappRevisePayload(f, id) {
  const instruction = val(f, 'instruction').trim();
  if (instruction.length < 2) throw new Error('请写下要怎么修改');
  return {action: 'revise', id, instruction: instruction.slice(0, 3000)};
}
export function miniappVersionsView(r, {date}) {
  const rows = (r.versions || []).map(v => `<li><span><b>${escape(date(v.time))}</b>${v.note ? ` · ${escape(v.note)}` : ''}</span><button type="button" class="secondary" data-action="miniappRestore" data-id="${v.index}">恢复这个版本</button></li>`).join('');
  return `<p class="hint">当前：${escape(date(r.current?.time))}${r.current?.note ? ` · ${escape(r.current.note)}` : ''}</p>${rows ? `<ol class="miniapp-versions">${rows}</ol>` : '<p class="empty-note">还没有历史版本。</p>'}`;
}

/** Start the app in the double sandbox. hooks: {onStorage(op), onError(message), onReady()}. Returns dispose(). */
export function mountMiniApp(host, {html, storage = {}}, hooks = {}) {
  const doc = host.ownerDocument, win = doc.defaultView, token = win.crypto.randomUUID();
  const frame = doc.createElement('iframe'), note = doc.createElement('p');
  let disposed = false, sent = false, timer;
  frame.className = 'miniapp-frame'; frame.title = '小应用'; frame.setAttribute('sandbox', 'allow-scripts'); frame.referrerPolicy = 'no-referrer';
  const finish = () => { win.clearTimeout(timer); };
  const fail = reason => { if (disposed) return; disposed = true; finish(); win.removeEventListener('message', listener); frame.remove(); note.textContent = '小应用未能启动：' + reason; note.className = 'chart-error'; };
  const listener = e => {
    if (disposed || e.source !== frame.contentWindow || e.data?.token !== token) return;
    const k = e.data.kind;
    if (k === 'app-ready' && !sent) { sent = true; finish(); timer = win.setTimeout(() => fail('载入超时'), 10000); frame.contentWindow.postMessage({kind: 'app-document', token, source: html, storage}, '*'); }
    else if (k === 'app-complete' && sent) { finish(); note.remove(); hooks.onReady?.(); }
    else if (k === 'app-storage' && sent) hooks.onStorage?.({op: e.data.op, key: e.data.key, value: e.data.value});
    else if (k === 'app-error' && sent) hooks.onError?.(String(e.data.value || '脚本错误').slice(0, 300));
  };
  if (typeof html !== 'string' || html.length > HTML_BYTES) { host.textContent = '小应用代码超出 256 KB。'; return () => {}; }
  win.addEventListener('message', listener);
  timer = win.setTimeout(() => fail('隔离环境没有响应'), 5000);
  note.textContent = '正在启动小应用…';
  frame.src = (win.location.protocol === 'file:' ? 'willbuddy-preview://local/apps/index.html#' : 'apps/index.html#') + token;
  host.replaceChildren(note, frame);
  return () => { disposed = true; finish(); win.removeEventListener('message', listener); frame.remove(); };
}
