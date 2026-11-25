// [p4-m1][ux8] Dashboards: list page, create form, chat cards, and the viewer bridge to the isolated chart frame.
// If the chart frame cannot start (or reports an error), the viewer falls back to simple local charts, never a blank box.
import { escape } from './markdown.js';
import { computeDashboard, filterOptions, inferColumns, formatValue } from '../shared/dashboard.js';
import { chartSpec, chartFigure } from './charts.js';

export const STUDIO_TABS = [['dashboards', '仪表盘'], ['infographics', '信息图与海报'], ['miniapps', '小应用']]; // [p4-m3][p4-m4]
const SOURCE_LABEL = {document: '成果中心表格', file: '本机文件', granted: '授权文件夹', connectors: '已同步的连接内容'};
export const READY_TIMEOUT = 6000;

export function studioPage(state, {action, heading, empty, date, tab = 'dashboards'}) {
  const tabs = `<div class="feed-filters studio-tabs" role="tablist">${STUDIO_TABS.map(([id, label]) => `<button type="button" role="tab" aria-selected="${id === tab}" class="${id === tab ? 'chosen' : ''}" data-action="studioTab" data-id="${id}">${label}</button>`).join('')}</div>`;
  const list = state.dashboards || [];
  const cards = list.map(d => `<div class="card dash-card"><div class="graph-head"><h3>${escape(d.name)}</h3><span class="graph-type" style="--c:#0078CB">${d.designer === 'model' ? '模型设计' : '自动排版'}</span></div>
<small class="graph-alias">${escape(SOURCE_LABEL[d.source?.kind] || '')}${d.source?.name ? ' · ' + escape(d.source.name) : ''}${d.source?.sheet ? ' · ' + escape(d.source.sheet) : ''} · ${d.rows} 行${d.truncated ? '（已截取）' : ''}</small>
<p>${(d.spec?.kpis?.length || 0)} 个指标 · ${(d.spec?.charts?.length || 0)} 个图表 · 更新于 ${escape(date(d.updated))}</p>
<div class="actions">${action('打开', 'dashboardOpen', d.id, 'primary')}${action('重新设计', 'dashboardRedesign', d.id)}${action('重命名', 'dashboardRename', d.id)}${action('删除', 'dashboardRemove', d.id)}</div></div>`).join('');
  const head = heading('', '仪表盘', '在对话里附上 Excel / CSV 数据表，QuankSight 会在回复下方自动生成仪表盘；也可以在这里从成果中心的表格新建。图上的每个数字都由本机按真实数据计算。', action('＋ 新建仪表盘', 'dashboardNew', '', 'primary'));
  return `<div class="page">${head}${tabs}${list.length ? `<div class="cards">${cards}</div>` : empty('还没有仪表盘', '在对话框里添加一份 Excel / CSV 数据表并发送，回复下方就会出现仪表盘。')}</div>`;
}

/** Cards under an assistant reply for dashboards generated from the turn's spreadsheet attachments. */
export function dashboardCards(m, state) {
  const list = Array.isArray(m?.dashboards) ? m.dashboards : [];
  if (!list.length) return '';
  return `<div class="dash-cards">${list.map(x => {
    const d = (state.dashboards || []).find(d => d.id === x.id);
    if (!d) return `<div class="dash-chip gone">📊 ${escape(x.name || '仪表盘')}<small>已删除</small></div>`;
    const kpis = (d.spec?.kpis || []).slice(0, 3).map(k => escape(k.label)).join(' · ');
    return `<button type="button" class="dash-chip" data-action="dashboardOpen" data-id="${escape(d.id)}"><span class="dash-icon" aria-hidden="true">📊</span><span><b>${escape(d.name)}</b><small>${d.rows} 行 · ${(d.spec?.charts?.length || 0)} 个图表${kpis ? ' · ' + kpis : ''}</small></span><em>打开仪表盘</em></button>`;
  }).join('')}</div>`;
}

export function dashboardForm(state, {documentId = '', source = ''} = {}) {
  const docs = (state.documents || []).filter(d => d.format === 'xlsx');
  const src = source || (documentId ? 'document' : docs.length ? 'document' : 'file');
  const hasConn = (state.connectorItems || []).length > 0;
  return `<div class="task-form"><label>数据来源<select name="source">
<option value="document" ${src === 'document' ? 'selected' : ''} ${docs.length ? '' : 'disabled'}>成果中心的 Excel 表格${docs.length ? '' : '（暂无）'}</option>
<option value="file" ${src === 'file' ? 'selected' : ''}>选择本机 Excel / CSV 文件…</option>
<option value="connectors" ${src === 'connectors' ? 'selected' : ''} ${hasConn ? '' : 'disabled'}>已同步的连接内容（邮件、日程、订阅、群消息）${hasConn ? '' : '（暂无）'}</option></select></label>
${docs.length ? `<label>表格<select name="documentId">${docs.map(d => `<option value="${escape(d.id)}" ${d.id === documentId ? 'selected' : ''}>${escape(d.name)}</option>`).join('')}</select></label>` : ''}
<label>工作表（可留空，默认第一个）<input name="sheet" maxlength="31" autocomplete="off"></label>
<label>想看什么（可留空）<textarea name="prompt" rows="3" maxlength="2000" placeholder="例如：按月看各区域销售额趋势，找出增长最快的产品"></textarea></label>
<label class="check"><input type="checkbox" name="sendSamples" checked> 允许把每列的几个样例值发给模型（只发列名和类型可取消勾选）</label>
<p class="task-form-note">未配置模型时按数据自动排版。数据快照保存在本机，原文件之后改动不影响已生成的仪表盘。</p></div>`;
}
export function dashboardPayload(f) {
  return {action: 'create', source: String(f.get('source') || ''), documentId: String(f.get('documentId') || ''), sheet: String(f.get('sheet') || '').trim() || undefined,
    prompt: String(f.get('prompt') || ''), sendSamples: f.has('sendSamples')};
}
export function dashboardRedesignForm(d) {
  return `<div class="task-form"><label>新的要求<textarea name="prompt" rows="4" maxlength="2000" placeholder="例如：去掉散点图，增加按销售员的排名">${escape(d?.prompt || '')}</textarea></label>
<label class="check"><input type="checkbox" name="sendSamples" checked> 允许发送样例值</label><p class="task-form-note">只改版式，数据不变。</p></div>`;
}

export function dashboardViewer(id) {
  return `<div class="viz-toolbar">${['导出图片:dashboardExportPng', '导出网页:dashboardExportHtml', '重新设计:dashboardRedesign'].map(x => { const [l, a] = x.split(':'); return `<button type="button" class="secondary" data-action="${a}" data-id="${escape(id)}">${l}</button>`; }).join('')}</div><div class="viz-host" data-dashboard-id="${escape(id)}"></div>`;
}

/** Simple local rendering (SVG charts + tables) used when the ECharts frame is unavailable. */
export function fallbackView(doc, view, reason = '') {
  const make = (tag, text, cls) => { const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const box = make('div', undefined, 'viz-fallback');
  box.append(make('p', '交互图表组件未能启动，已用简化图表显示（筛选和导出图片暂不可用）。' + (reason ? `原因：${reason}` : ''), 'viz-fallback-note'));
  const head = make('div', undefined, 'viz-fb-head');
  head.append(make('h2', view.title), make('small', `共 ${view.totalRows} 行数据`));
  box.append(head);
  if (view.kpis.length) { const k = make('div', undefined, 'viz-fb-kpis'); for (const x of view.kpis) { const c = make('div', undefined, 'viz-fb-kpi'); c.append(make('small', x.label), make('b', x.display)); k.append(c); } box.append(k); }
  const grid = make('div', undefined, 'viz-fb-grid');
  for (const c of view.charts) {
    const card = make('section', undefined, 'viz-fb-card');
    if (c.type === 'table') {
      card.append(make('h3', c.title));
      const t = make('table'), hr = make('tr');
      c.columns.forEach(h => hr.append(make('th', String(h))));
      t.append(hr);
      for (const r of c.rows.slice(0, 50)) { const tr = make('tr'); r.forEach(v => tr.append(make('td', typeof v === 'number' ? formatValue(v) : String(v ?? '')))); t.append(tr); }
      const wrap = make('div', undefined, 'table-scroll'); wrap.append(t); card.append(wrap);
    } else if (c.type === 'scatter') {
      card.append(make('h3', c.title), make('p', `${c.points.length} 个数据点（简化模式不显示散点图）`, 'viz-fallback-note'));
    } else {
      try {
        const labels = (c.labels || []).slice(0, 30).map(l => String(l || '—').slice(0, 80));
        const series = (c.series || []).slice(0, 4).map(s => ({name: String(s.name || '数值').slice(0, 80), values: s.values.slice(0, 30).map(v => Number.isFinite(v) ? Math.max(-1e12, Math.min(1e12, v)) : 0)}));
        const type = c.type === 'pie' ? 'pie' : c.type === 'line' ? 'line' : 'bar';
        const spec = chartSpec(JSON.stringify({type, title: String(c.title || '图表').slice(0, 80), labels, series: type === 'pie' ? series.slice(0, 1).map(s => ({...s, values: s.values.map(v => Math.max(0, v))})) : series}));
        card.append(chartFigure(doc, spec));
      } catch (e) { card.append(make('h3', c.title), make('p', '这个图表无法用简化模式显示：' + e.message, 'viz-fallback-note')); }
    }
    grid.append(card);
  }
  box.append(grid);
  return box;
}

/** Mounts the chart frame for one dashboard. Returns {exportPng(): Promise<string>, filters(), mode(), dispose()}. */
export function mountDashboard(host, dashboard, {timeoutMs = READY_TIMEOUT} = {}) {
  const doc = host.ownerDocument, win = doc.defaultView, token = win.crypto.randomUUID();
  const frame = doc.createElement('iframe'), note = doc.createElement('p');
  const cols = inferColumns(dashboard.table.columns, dashboard.table.rows), options = filterOptions(dashboard.table, dashboard.spec, cols);
  let filters = {}, ready = false, loaded = false, pendingImage = null, disposed = false, mode = 'frame';
  frame.className = 'viz-frame'; frame.title = '仪表盘'; frame.setAttribute('sandbox', 'allow-scripts'); frame.referrerPolicy = 'no-referrer';
  note.className = 'preview-loading'; note.textContent = '正在加载仪表盘…';
  const view = () => computeDashboard(dashboard.table, dashboard.spec, filters);
  const post = () => frame.contentWindow?.postMessage({kind: 'viz-render', token, view: view(), options, filters}, '*');
  const fallback = reason => {
    if (disposed || mode === 'fallback') return;
    mode = 'fallback'; win.clearTimeout(timer); frame.remove();
    try { host.replaceChildren(fallbackView(doc, view(), reason)); } catch (e) { note.textContent = '仪表盘无法显示：' + e.message; host.replaceChildren(note); }
  };
  const listener = e => {
    if (disposed || mode !== 'frame' || e.source !== frame.contentWindow || e.data?.token !== token) return;
    if (e.data.kind === 'viz-ready' && !ready) { ready = true; win.clearTimeout(timer); try { post(); } catch (err) { fallback(err.message); } }
    else if (e.data.kind === 'viz-rendered') note.remove();
    else if (e.data.kind === 'viz-error') fallback(String(e.data.message || '组件出错').slice(0, 200));
    else if (e.data.kind === 'viz-filter' && ready) {
      const f = e.data.filters;
      if (f && typeof f === 'object' && JSON.stringify(f).length < 100000) { filters = structuredClone(f); try { post(); } catch (err) { fallback(err.message); } }
    } else if (e.data.kind === 'viz-image' && pendingImage) {
      const ok = typeof e.data.dataUrl === 'string' && e.data.dataUrl.startsWith('data:image/png;base64,');
      pendingImage[ok ? 'resolve' : 'reject'](ok ? e.data.dataUrl : new Error('图片导出失败')); pendingImage = null;
    }
  };
  win.addEventListener('message', listener);
  frame.addEventListener('load', () => { loaded = true; });
  frame.src = (win.location.protocol === 'file:' ? 'willbuddy-preview://local/viz/index.html#' : 'viz/index.html#') + token;
  host.replaceChildren(note, frame);
  const timer = win.setTimeout(() => { if (!ready) fallback(loaded ? '图表脚本没有运行' : '图表页面没有加载'); }, timeoutMs);
  return {
    filters: () => structuredClone(filters),
    mode: () => mode,
    exportPng() {
      if (mode === 'fallback') return Promise.reject(new Error('简化图表模式不支持导出图片，可以导出网页'));
      if (!ready) return Promise.reject(new Error('仪表盘还在加载'));
      return new Promise((resolve, reject) => { pendingImage = {resolve, reject}; frame.contentWindow.postMessage({kind: 'viz-export', token}, '*'); win.setTimeout(() => { if (pendingImage) { pendingImage = null; reject(new Error('图片导出超时')); } }, 20000); });
    },
    dispose() { disposed = true; win.clearTimeout(timer); win.removeEventListener('message', listener); frame.remove(); },
  };
}
