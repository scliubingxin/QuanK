// [F2] 投研文档 UI: the 投研资料 box on the stock detail page (announcements + this stock's library), the 投研资料库 box on the
// 量化 page, and the forms / detail views used by app.js (exported together as researchUI so the renderer imports one name).
import { escape } from './markdown.js';
import { LIBRARY_KINDS } from '../shared/research.js';

const val = (fm, n) => String((typeof fm?.get === 'function' ? fm.get(n) : fm?.querySelector?.(`[name="${n}"]`)?.value ?? fm?.elements?.[n]?.value) ?? '');
const on = (fm, n) => typeof fm?.get === 'function' ? fm.get(n) !== null : !!(fm?.querySelector?.(`[name="${n}"]`)?.checked ?? fm?.elements?.[n]?.checked);
const tag = (label, cls = 'low') => `<span class="rs-tag rs-${escape(cls)}">${escape(label)}</span>`;
const KIND_CLS = {report: 'kind-report', notice: 'kind-notice', note: 'kind-note', doc: 'kind-doc', export: 'kind-export', quant: 'kind-quant'};
const FMT = {docx: 'Word', pptx: 'PPT', html: '网页'};

function libraryRows(items, {action, date, withStock = false}) {
  return items.map(x => `<li class="rs-row"><time>${escape(date(x.time))}</time>${tag(LIBRARY_KINDS[x.kind] || x.kind, KIND_CLS[x.kind] || 'low')}<span class="rs-title">${withStock && x.code ? `<b>${escape(x.name || x.code)}</b> ` : ''}${escape(x.title)}${x.format ? ` <small>${escape(FMT[x.format] || x.format)}</small>` : ''}</span><span class="rs-acts">${action('打开', 'researchOpen', x.id)}${action('删除', 'researchRemove', x.id)}</span></li>`).join('');
}

/** Stock detail: latest announcements (tagged by type and importance) and everything archived for this stock. */
export function researchBox(code, research, {action, date = t => String(t)}) {
  const r = research || {}, block = r.notices?.[code], notices = (block?.list || []).slice(0, 8), lib = (r.library || []).filter(x => x.code === code).slice(0, 12);
  const nlist = notices.length ? `<ul class="rs-list">${notices.map(n => `<li class="rs-row"><time>${escape(n.date)}</time>${tag(n.label, n.level)}<span class="rs-title">${escape(n.title)}</span><span class="rs-acts">${action('解读', 'researchNotice', n.id)}</span></li>${n.points?.[0] ? `<li class="rs-point">${escape(n.points[0])}</li>` : ''}`).join('')}</ul>` : '<p class="empty-note">点「刷新公告」获取这只股票最近的公告。</p>';
  const llist = lib.length ? `<ul class="rs-list">${libraryRows(lib, {action, date})}</ul>` : '<p class="empty-note">生成的研报、收藏的公告和你的笔记会归档在这里，也可以在对话里说「把这份研报和通威放一起」。</p>';
  return `<section class="q-box rs-box" id="researchBox" data-code="${escape(code)}"><div class="rs-head"><h3>投研资料</h3><span class="rs-tools">${action('生成研报', 'researchReport', code, 'primary')}${action('刷新公告', 'researchNotices', code)}${action('记笔记', 'researchNote', code)}${action('关联文档', 'researchLink', code)}</span></div>
<div class="rs-cols"><div class="rs-col"><h4>近期公告<small>${block?.at ? '更新于 ' + escape(date(block.at)) : ''}</small></h4>${nlist}</div><div class="rs-col"><h4>我的资料<small>${lib.length ? lib.length + ' 条' : ''}</small></h4>${llist}</div></div></section>`;
}

/** 量化 page: recent library items across stocks + exports. */
export function researchLibraryBox(research, {action, date = t => String(t)}) {
  const r = research || {}, items = (r.library || []).slice(0, 10), w = r.watch || {};
  const tools = action('导出组合复盘', 'researchExport', 'review', 'primary') + action('导出每日简报', 'researchExport', 'briefing') + action('记笔记', 'researchNote', '') + action('公告提醒', 'researchWatch');
  return `<section class="q-box q-research"><div class="plaza-section-head"><h2>投研资料库</h2><small>${w.enabled === false ? '公告提醒已关闭' : `工作日每 ${escape(String(w.interval || 30))} 分钟检查股票池公告，重要公告进入「动态」`} · 研报、公告、笔记与导出都保存在本机。</small><span class="q-head-tools">${tools}</span></div>
${items.length ? `<ul class="rs-list">${libraryRows(items, {action, date, withStock: true})}</ul>` : '<p class="empty-note">还没有资料。打开一只股票点「生成研报」，或在对话里说「给通威股份出一份研报」。</p>'}</section>`;
}

// ---------- forms ----------
function reportForm() {
  return `<label>格式<select name="format"><option value="docx">Word 文档（含 K 线与收益率附图）</option><option value="pptx">PPT 演示</option><option value="html">网页（图表清晰，可直接分享）</option></select></label>
<label class="check"><input type="checkbox" name="ai" checked> 加入 AI 研判（需要已配置模型；不影响报告里的数字）</label>
<p class="hint">汇总本机量化信号与风控、回测、持仓、实时行情和近期公告，保存到「成果中心」并归档到这只股票的资料里。报告仅供研究，不构成投资建议。</p>`;
}
const reportPayload = (fm, code) => ({action: 'report', code, format: ['docx', 'pptx', 'html'].includes(val(fm, 'format')) ? val(fm, 'format') : 'docx', ai: on(fm, 'ai')});
function noteForm() {
  return `<label>标题（可留空）<input name="title" maxlength="60" placeholder="例如：三季报电话会要点"></label><label>内容<textarea name="text" rows="7" maxlength="8000" required placeholder="你的观察、调研纪要或交易计划"></textarea></label><p class="hint">笔记只保存在本机，可在对话里引用：「看看我对通威的笔记」。</p>`;
}
const notePayload = (fm, code) => ({action: 'note', ...(code ? {code} : {}), title: val(fm, 'title').trim(), text: val(fm, 'text').trim()});
function linkForm(documents = []) {
  const list = (documents || []).slice(0, 100);
  return list.length ? `<label>成果中心文档<select name="documentId">${list.map(d => `<option value="${escape(d.id)}">${escape(d.name)}.${escape(d.format)}</option>`).join('')}</select></label><p class="hint">关联后可以在这只股票的资料里打开，也能在对话里引用。</p>` : '<p class="hint">成果中心还没有文档。</p>';
}
const linkPayload = (fm, code) => ({action: 'link', documentId: val(fm, 'documentId'), ...(code ? {code} : {})});
function exportForm(kind = '', state = {}) {
  const defs = state?.quant?.reportDefs || [];
  return `<label>内容<select name="kind"><option value="review" ${kind === 'review' ? 'selected' : ''}>组合复盘（行情、持仓、信号分布、公告与风险）</option><option value="briefing" ${kind === 'briefing' ? 'selected' : ''}>每日简报（最近一次）</option>${defs.length ? `<option value="quant_report" ${kind === 'quant_report' ? 'selected' : ''}>量化引擎报告</option>` : ''}</select></label>
${defs.length ? `<label>引擎报告（选「量化引擎报告」时）<select name="reportId">${defs.map(d => `<option value="${escape(d.id)}">${escape(d.title)}</option>`).join('')}</select></label>` : ''}
<label>格式<select name="format"><option value="docx">Word 文档</option><option value="pptx">PPT 演示</option><option value="html">网页</option></select></label><p class="hint">导出到「成果中心」；Word 可在预览里再导出为 PDF。</p>`;
}
const exportPayload = fm => ({action: 'export', kind: ['review', 'briefing', 'quant_report'].includes(val(fm, 'kind')) ? val(fm, 'kind') : 'review', format: ['docx', 'pptx', 'html'].includes(val(fm, 'format')) ? val(fm, 'format') : 'docx', ...(val(fm, 'reportId') ? {id: val(fm, 'reportId')} : {})});
function watchForm(w = {}) {
  return `<label class="check"><input type="checkbox" name="enabled" ${w.enabled === false ? '' : 'checked'}> 自动检查股票池公告：业绩预告、定期报告、风险事项、股东变动、回购分红等进入「动态」并发系统通知</label>
<label>检查间隔<select name="interval">${[15, 30, 60, 120].map(n => `<option value="${n}" ${n === (w.interval || 30) ? 'selected' : ''}>每 ${n} 分钟</option>`).join('')}</select></label><p class="hint">工作日 7:00–23:00 检查；需要 QuankSight 保持运行。公告来自公开公告接口，以交易所披露的原文为准。</p>`;
}
const watchPayload = fm => ({action: 'watch', enabled: on(fm, 'enabled'), interval: Number(val(fm, 'interval')) || 30});

// ---------- detail views ----------
function noticeDetail(n = {}) {
  const ai = n.summary ? `<div class="rs-ai"><b>AI 解读</b><div class="rs-ai-text">${escape(n.summary)}</div><small>由模型根据公告原文生成，可能有遗漏，请以原文为准。</small></div>` : n.aiError ? `<p class="hint">${escape(n.aiError)}</p>` : '';
  return `<p class="hint">${escape(n.date || '')} ${n.label ? tag(n.label, n.level) : ''} ${escape(n.name || '')}${n.code ? ' ' + escape(n.code) : ''}</p>${ai}
${n.points?.length ? `<h4>要点摘录</h4><ul class="rs-points">${n.points.map(p => `<li>${escape(p)}</li>`).join('')}</ul>` : ''}
<details class="rs-full"><summary>公告原文${n.truncated ? '（节选）' : ''}</summary><pre class="rs-text">${escape(n.text || '')}</pre></details>
<p class="rs-modal-acts"><button type="button" data-action="researchSaveNotice" data-id="${escape(n.id || '')}">收入资料库</button>${n.pdf ? `<a href="${escape(n.pdf)}" target="_blank" rel="noopener noreferrer">查看交易所 PDF 原文 ↗</a>` : ''}</p>`;
}
function noteDetail(it = {}) {
  return `<p class="hint">${escape(it.name || '')}${it.code ? ' ' + escape(it.code) : ''}${it.tags?.length ? ' · ' + it.tags.map(t => escape(t)).join('、') : ''}</p><pre class="rs-text">${escape(it.text || it.summary || '')}</pre>`;
}

export const researchUI = {reportForm, reportPayload, noteForm, notePayload, linkForm, linkPayload, exportForm, exportPayload, watchForm, watchPayload, noticeDetail, noteDetail};
