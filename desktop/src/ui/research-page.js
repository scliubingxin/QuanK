// [v0.53] 资料库 → 投研资料: every stock's research material in one place, by stock and by kind (研报 / 公告 / 笔记 /
// 文档 / 导出 / 量化日报), searchable and maintainable (add / edit notes, link documents, delete); plus the 投研知识库,
// the engine's 日报与复盘 and the 训练数据 that signals collect for retraining the strategy model.
import { escape } from './markdown.js';
import { LIBRARY_KINDS } from '../shared/research.js';
import { knowledgeLibraryBox } from './knowledge.js';
import { reportsBox } from './quant.js';

const KIND_CLS = {report: 'kind-report', notice: 'kind-notice', note: 'kind-note', doc: 'kind-doc', export: 'kind-export', quant: 'kind-quant'};
const FMT = {docx: 'Word', pptx: 'PPT', html: '网页'};
const ACTION_TEXT = {STRONG_BUY: '强烈买入', BUY: '买入', HOLD: '持有', NORMAL: '谨慎定投', PAUSE: '暂停定投', SELL: '卖出', STRONG_SELL: '强烈卖出'};
const pct = v => v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2).replace(/\.00$/, '')}%`;

/** Stocks that have material or are in the pool: [{code, name, count}], pool order first. */
export function researchStocks(state) {
  const lib = state?.research?.library || [], pool = state?.quant?.pool || [], map = new Map();
  for (const p of pool) map.set(p.code, {code: p.code, name: p.name || p.code, count: 0});
  for (const x of lib) { if (!x.code) continue; const e = map.get(x.code) || {code: x.code, name: x.name || x.code, count: 0}; e.count++; if (!e.name || e.name === e.code) e.name = x.name || e.name; map.set(x.code, e); }
  return [...map.values()];
}
export function filterLibrary(lib = [], {stock = '', kind = '', query = ''} = {}) {
  const terms = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return lib.filter(x => (!stock || (stock === '_' ? !x.code : x.code === stock)) && (!kind || x.kind === kind)
    && terms.every(t => [x.title, x.summary, x.name, x.code, x.preview, ...(x.tags || [])].join(' ').toLowerCase().includes(t)));
}
function rows(items, {action, date}) {
  return items.map(x => `<li class="rs-row"><time>${escape(date(x.time))}</time><span class="rs-tag rs-${escape(KIND_CLS[x.kind] || 'low')}">${escape(LIBRARY_KINDS[x.kind] || x.kind)}</span><span class="rs-title">${x.code ? `<b>${escape(x.name || x.code)}</b> ` : ''}${escape(x.title)}${x.format ? ` <small>${escape(FMT[x.format] || x.format)}</small>` : ''}${x.summary ? `<small class="rs-sum">${escape(x.summary)}</small>` : ''}</span><span class="rs-acts">${action('打开', 'researchOpen', x.id)}${x.kind === 'note' ? action('编辑', 'researchEdit', x.id) : ''}${action('删除', 'researchRemove', x.id)}</span></li>`).join('');
}
export function datasetBox(ds, {action, date}) {
  const s = ds?.stats || {}, recent = ds?.recent || [];
  const by = Object.entries(s.byAction || {}).map(([a, o]) => `<span><b>${o.hitRate === null ? '—' : o.hitRate + '%'}</b>${escape(ACTION_TEXT[a] || a)} · ${o.n} 条 · 20 日均 ${pct(o.avgRet20)}</span>`).join('');
  const list = recent.length ? `<div class="table-scroll"><table class="q-table"><thead><tr><th>日期</th><th>股票</th><th>信号</th><th>综合分</th><th>倍率</th><th>模型概率</th><th>5 日</th><th>20 日</th><th>结果</th></tr></thead><tbody>${recent.map(r => `<tr><td>${escape(r.date)}</td><td>${escape(r.name || r.code)}</td><td>${escape(ACTION_TEXT[r.action] || r.actionText || r.action)}</td><td>${r.score ?? '—'}</td><td>${r.multiplier ?? '—'}</td><td>${r.probPct == null ? '—' : r.probPct + '%'}</td><td>${pct(r.label?.ret5)}</td><td>${pct(r.label?.ret20)}</td><td>${r.label?.outcome === 'right' ? '<span class="up">对</span>' : r.label?.outcome === 'wrong' ? '<span class="down">错</span>' : r.label?.complete ? '—' : '待标注'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty-note">还没有记录。股票池每算一次信号，QuanK 就记下当天的档位、综合分、倍率、模型概率和各项因子得分。</p>';
  const tools = action('立即标注', 'datasetLabel') + action('导出 CSV', 'datasetExport', 'csv') + action('导出 JSONL', 'datasetExport', 'jsonl') + action('写入策略项目', 'datasetExport', 'project', 'primary');
  return `<section class="q-box ds-box" id="datasetBox"><div class="plaza-section-head"><h2>训练数据</h2><small>每只股票每个交易日一条信号记录，满 20 个交易日后自动标注之后的涨跌和对错，用于重新训练策略模型。</small><span class="q-head-tools">${tools}</span></div>
<div class="td-stats"><span><b>${s.total ?? 0}</b><small>条记录 · ${s.stocks ?? 0} 只股票</small></span><span><b>${s.labelled ?? 0}</b><small>已标注 · 待标注 ${s.pending ?? 0}</small></span><span><b>${s.hitRate == null ? '—' : s.hitRate + '%'}</b><small>买卖点 20 日命中率</small></span><span><b>${escape(s.first || '—')}</b><small>到 ${escape(s.last || '—')}</small></span></div>
${by ? `<div class="q-metrics ds-by">${by}</div>` : ''}${list}
<p class="auto-note">「写入策略项目」会把已标注的数据写到策略项目的 quank_dataset/ 文件夹（${escape(ds?.project || '导入策略项目后可用')}），训练脚本可以直接读取。数据只保存在这台 Mac 上${ds?.lastLabel ? `，上次标注 ${escape(date(ds.lastLabel))}` : ''}。</p></section>`;
}

export function researchPage(state, {action, date = t => String(t), stock = '', kind = '', query = ''}) {
  const lib = state?.research?.library || [], stocks = researchStocks(state), items = filterLibrary(lib, {stock, kind, query});
  const count = (k, s = stock) => filterLibrary(lib, {stock: s, kind: k}).length;
  const chip = (id, label, n, on, act) => `<button type="button" class="${on ? 'chosen' : ''}" data-action="${act}" data-id="${escape(id)}">${escape(label)}${n ? ` <small>${n}</small>` : ''}</button>`;
  const stockChips = `<div class="feed-filters rp-stocks">${chip('', '全部股票', lib.length, !stock, 'rpStock')}${stocks.map(s => chip(s.code, s.name, s.count, stock === s.code, 'rpStock')).join('')}${lib.some(x => !x.code) ? chip('_', '组合与综合', lib.filter(x => !x.code).length, stock === '_', 'rpStock') : ''}</div>`;
  const kindChips = `<div class="feed-filters rp-kinds">${chip('', '全部类型', count(''), !kind, 'rpKind')}${Object.entries(LIBRARY_KINDS).map(([k, l]) => chip(k, l, count(k), kind === k, 'rpKind')).join('')}</div>`;
  const cur = stocks.find(s => s.code === stock);
  const tools = action('＋ 记笔记', 'researchNote', stock && stock !== '_' ? stock : '', 'primary') + action('关联文档', 'researchLink', stock && stock !== '_' ? stock : '') + (cur ? action('生成研报', 'researchReport', cur.code) + action('刷新公告', 'researchNotices', cur.code) : '') + action('导出组合复盘', 'researchExport', 'review');
  const search = `<div class="kb-search rp-search"><input id="rpQuery" value="${escape(query)}" placeholder="在资料里搜索：标题、摘要、标签、股票" autocomplete="off">${action('搜索', 'rpSearch', '', 'primary')}${query ? action('清除', 'rpQuery', '') : ''}</div>`;
  const list = items.length ? `<ul class="rs-list">${rows(items.slice(0, 200), {action, date})}</ul>` : `<p class="empty-note">${lib.length ? '没有符合条件的资料。' : '还没有资料。打开一只股票点「生成研报」、收藏公告或记笔记，引擎的日报复盘也会自动归档到这里。'}</p>`;
  const hero = `<div class="page-title page-hero"><div><h1>投研资料，<em>按股票分好类</em></h1><p>研报、公告、笔记、导出和量化日报都按股票归档在本机，可以搜索、编辑和删除；在对话里也能引用：「看看我对通威的笔记」。</p><div class="plaza-stats"><span><b>${lib.length}</b>份资料</span><span><b>${stocks.filter(s => s.count).length}</b>只股票有资料</span><span><b>${state?.dataset?.stats?.total ?? 0}</b>条训练数据</span></div></div></div>`;
  return `<div class="page quant-page research-page">${hero}<section class="q-box q-research" id="researchPage"><div class="plaza-section-head"><h2>${escape(cur ? cur.name + ' 的资料' : stock === '_' ? '组合与综合资料' : '全部资料')}</h2><small>${items.length} 份</small><span class="q-head-tools">${tools}</span></div>${stockChips}${kindChips}${search}${list}</section>
${knowledgeLibraryBox(state.knowledge, {action, date})}${state.quant ? reportsBox(state.quant, {action, date}) : ''}${datasetBox(state.dataset, {action, date})}</div>`;
}
export function noteEditForm(it = {}) {
  return `<label>标题<input name="title" maxlength="60" value="${escape(it.title || '')}"></label><label>内容<textarea name="text" rows="10" maxlength="8000" required>${escape(it.text || '')}</textarea></label><label>标签（用空格分隔，可留空）<input name="tags" maxlength="80" value="${escape((it.tags || []).join(' '))}"></label>`;
}
