// [F3] 投研知识库 UI: the 财务与关系 box on the stock detail page (lazy: filled by mountKnowledge), the 知识库 box on the
// 量化 page (search + research topics), result views and topic forms. Exported together as knowledgeUI for app.js.
import { escape } from './markdown.js';
import { SEARCH_KINDS } from '../shared/knowledge.js';

const val = (fm, n) => String((typeof fm?.get === 'function' ? fm.get(n) : fm?.querySelector?.(`[name="${n}"]`)?.value ?? fm?.elements?.[n]?.value) ?? '');
const on = (fm, n) => typeof fm?.get === 'function' ? fm.get(n) !== null : !!(fm?.querySelector?.(`[name="${n}"]`)?.checked ?? fm?.elements?.[n]?.checked);
const table = t => t?.length > 1 ? `<div class="table-scroll"><table class="q-table kn-table"><thead><tr>${t[0].map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${t.slice(1).map(r => `<tr>${r.map(c => `<td class="${/^[+-]/.test(String(c)) && /%$/.test(String(c)) ? (String(c)[0] === '-' ? 'down' : 'up') : ''}">${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** Stock detail placeholder; mountKnowledge loads 财务 first and 关系图 on demand. */
export function knowledgeBox(code, initial = 'finance') {
  const graph = initial === 'graph';
  return `<section class="q-box kn-box" id="knowledgeBox" data-kn-code="${escape(code)}" data-kn-initial="${graph ? 'graph' : 'finance'}"><div class="kn-head"><h3>财务与关系</h3><div class="mk-seg kn-tabs"><button type="button" data-kn="finance"${graph ? '' : ' class="chosen"'}>财务数据</button><button type="button" data-kn="graph"${graph ? ' class="chosen"' : ''}>公司关系图</button></div><span class="kn-tools"><button type="button" data-kn-refresh>刷新</button></span></div><div class="kn-body"><p class="empty-note">${graph ? '正在整理公司关系…' : '正在读取财务数据…'}</p></div></section>`;
}
export function financeHtml(f) {
  if (!f?.table) return '<p class="empty-note">没有财务数据。</p>';
  return `${f.summary?.lines?.length ? `<ul class="kn-lines">${f.summary.lines.map(l => `<li>${escape(l)}</li>`).join('')}</ul>` : ''}${f.svg || ''}${table(f.table)}<p class="auto-note">数据来自东方财富 F10 公开财务数据（累计值，单季值由相邻报告期相减得到），保存在本机，12 小时更新一次。</p>`;
}
export function graphHtml(g) {
  if (!g?.nodes) return '<p class="empty-note">没有关系数据。</p>';
  const p = g.profile || {}, holders = g.holders?.holders || [];
  const info = [['公司全称', p.fullName], ['所属行业', p.industry], ['证监会行业', p.csrc], ['实际控制人', p.controller], ['董事长 / 总经理', p.president], ['所在地', p.province], ['成立日期', p.founded]].filter(x => x[1]);
  return `${g.svg || ''}<div class="kn-cols"><div><h4>公司概况</h4><dl class="kn-dl">${info.map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('')}</dl>${p.business ? `<p class="kn-biz">${escape(p.business)}</p>` : ''}</div>
<div><h4>前十大股东${g.holders?.date ? `<small>${escape(g.holders.date)}</small>` : ''}</h4>${holders.length ? `<ol class="kn-holders">${holders.map(h => `<li><span>${escape(h.name)}</span><b>${h.ratio == null ? '—' : escape(h.ratio.toFixed(2)) + '%'}</b></li>`).join('')}</ol>` : '<p class="empty-note">暂无股东数据。</p>'}</div></div>
<p class="auto-note">上下游为按行业预置的通用产业链，仅作研究线索；股东与公司资料来自东方财富 F10 公开数据。点同行业自选股可直接打开。</p>`;
}

/** 量化 page: knowledge search + research topics. */
export function knowledgeLibraryBox(kn, {action, date = t => String(t)}) {
  const k = kn || {}, topics = k.topics || [];
  const tlist = topics.length ? `<ul class="rs-list">${topics.map(t => `<li class="rs-row kn-topic"><span class="rs-tag rs-kind-report">${t.enabled ? escape(WEEK[t.weekday] + ' ' + t.time) : '已暂停'}</span><span class="rs-title"><b>${escape(t.name)}</b> <small>${escape(t.keywords.join('、'))}${t.codes?.length ? ' · ' + escape(t.codes.join('、')) : ''}${t.lastDigest ? ' · 上次周报 ' + escape(date(t.lastDigest)) : ''}${t.error ? ' · ' + escape(t.error) : ''}</small></span><span class="rs-acts">${action('看动态', 'knTopicCollect', t.id)}${action('生成周报', 'knTopicDigest', t.id)}${action('编辑', 'knTopicEdit', t.id)}${action('删除', 'knTopicRemove', t.id)}</span></li>`).join('')}</ul>` : '<p class="empty-note">还没有研究主题。比如建一个「光伏产能出清」，填关键词「产能、减产、硅料价格」，QuankSight 会每周汇集相关公告、资讯和你的资料，生成主题周报。</p>';
  return `<section class="q-box q-knowledge"><div class="plaza-section-head"><h2>投研知识库</h2><small>${k.indexed ? `已索引 ${escape(String(k.indexed.documents))} 份资料` : '检索研报、公告、笔记、财务摘要与主题资讯'} · 全部在本机完成。</small><span class="q-head-tools">${action('＋ 研究主题', 'knTopicNew', '', 'primary')}</span></div>
<div class="kn-search"><input id="knQuery" type="search" maxlength="200" placeholder="例如：通威 质押、硅料价格、回购" aria-label="检索投研知识库"><button type="button" class="primary" data-action="knSearch">检索</button></div><div id="knResults"></div>
<h4 class="kn-sub">研究主题</h4>${tlist}</section>`;
}
export function searchResultsHtml(r, {action}) {
  if (!r?.hits?.length) return `<p class="empty-note">没有找到与「${escape(r?.query || '')}」相关的资料。可以先生成研报、收藏公告或打开个股的财务数据，资料越多检索越准。</p>`;
  return `<p class="hint">共 ${escape(String(r.total))} 处匹配，显示前 ${r.hits.length} 条</p><ol class="kn-hits">${r.hits.map(h => `<li><div class="kn-hit-head"><span class="rs-tag rs-kind-${escape(h.kind === 'finance' ? 'doc' : h.kind === 'news' ? 'export' : h.kind)}">${escape(SEARCH_KINDS[h.kind] || h.kind)}</span><b>${escape(h.title)}</b><small>${escape([h.name, h.date].filter(Boolean).join(' · '))}</small><span class="rs-acts">${h.documentId ? action('打开', 'documentView', h.documentId) : h.noticeId ? action('解读', 'researchNotice', h.noticeId) : h.url ? `<a href="${escape(h.url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a>` : h.code ? action('打开个股', 'quantOpen', h.code) : ''}</span></div><p>${escape(h.excerpt)}</p></li>`).join('')}</ol>`;
}
function topicItemsHtml(r) {
  const items = r?.items || [];
  return items.length ? `<ol class="kn-hits">${items.map(x => `<li><div class="kn-hit-head"><span class="rs-tag rs-kind-${escape(x.kind === 'news' ? 'export' : x.kind === 'finance' ? 'doc' : x.kind)}">${escape(SEARCH_KINDS[x.kind] || x.kind)}</span><b>${escape(x.title)}</b><small>${escape([x.name, x.date, (x.matched || []).join('、')].filter(Boolean).join(' · '))}</small>${x.url ? `<a href="${escape(x.url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a>` : ''}</div>${x.excerpt ? `<p>${escape(x.excerpt)}</p>` : ''}</li>`).join('')}</ol><p class="hint">资讯来自公开搜索结果，未经核实；公告以交易所原文为准。</p>` : '<p class="empty-note">暂时没有与这个主题相关的动态。</p>';
}
function topicForm(t = {}) {
  return `<label>主题名称<input name="name" maxlength="30" required value="${escape(t.name || '')}" placeholder="例如：光伏产能出清"></label>
<label>关键词（用逗号或空格分隔，至少 1 个）<input name="keywords" maxlength="200" required value="${escape((t.keywords || []).join('，'))}" placeholder="产能，减产，硅料价格"></label>
<label>关联股票代码（可留空，留空则看整个股票池）<input name="codes" maxlength="140" value="${escape((t.codes || []).join('，'))}" placeholder="600438，002129"></label>
<div class="form-row"><label>周报时间<select name="weekday">${WEEK.map((w, i) => `<option value="${i}" ${i === (t.weekday ?? 1) ? 'selected' : ''}>${w}</option>`).join('')}</select></label><label>&nbsp;<input type="time" name="time" value="${escape(t.time || '08:30')}"></label></div>
<label class="check"><input type="checkbox" name="enabled" ${t.enabled === false ? '' : 'checked'}> 每周自动生成主题周报（保存到成果中心，并进入「动态」）</label><p class="hint">资讯通过公开搜索获取，只把关键词发给搜索服务；需要 QuankSight 保持运行。</p>`;
}
const topicPayload = (fm, id = '') => ({action: 'topicSave', ...(id ? {id} : {}), name: val(fm, 'name').trim(), keywords: val(fm, 'keywords'), codes: val(fm, 'codes'), weekday: Number(val(fm, 'weekday')), time: val(fm, 'time') || '08:30', enabled: on(fm, 'enabled')});

const caches = new WeakMap(); // one cache per document: re-renders of the same page reuse results, other windows / tests do not
/** Fill #knowledgeBox: tab switch, lazy loading through call({action, code}), 10-minute cache; errors are never cached. */
export function mountKnowledge(root, call, {now = Date.now} = {}) {
  if (root && !caches.has(root)) caches.set(root, new Map());
  const kcache = caches.get(root) || new Map();
  const box = root.querySelector?.('#knowledgeBox[data-kn-code]');
  if (box && !box.dataset.bound) {
    box.dataset.bound = '1';
    const code = box.dataset.knCode, body = box.querySelector('.kn-body');
    let tab = box.dataset.knInitial === 'graph' ? 'graph' : 'finance', paintId = 0;
    const paint = async (fresh = false) => {
      const requestId = ++paintId;
      for (const b of box.querySelectorAll('[data-kn]')) {
        b.classList.toggle('chosen', b.dataset.kn === tab);
        b.setAttribute('aria-pressed', String(b.dataset.kn === tab));
      }
      const key = `${tab}|${code}`, hit = kcache.get(key);
      let d = !fresh && hit && now() - hit.at < 600e3 ? hit.data : null;
      if (!d) {
        if (body) body.innerHTML = `<p class="empty-note">${tab === 'finance' ? '正在读取财务数据…' : '正在整理公司关系…'}</p>`;
        try { const out = await call({action: tab, code, ...(fresh ? {fresh: true} : {})}); d = out?.result ?? out; kcache.set(key, {at: now(), data: d}); }
        catch (e) { if (requestId === paintId && body && box.isConnected) body.innerHTML = `<p class="task-error">${escape(String(e?.message || e).replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^(Type)?Error:\s*/, '').replace(/^fetch failed$/, '数据服务暂时连不上，请检查网络后点「刷新」'))}</p>`; return; }
      }
      if (requestId === paintId && box.isConnected && body) body.innerHTML = tab === 'finance' ? financeHtml(d) : graphHtml(d);
    };
    box.addEventListener('click', e => { const t = e.target.closest?.('[data-kn]'); if (t) { tab = t.dataset.kn; paint(); return; } if (e.target.closest?.('[data-kn-refresh]')) paint(true); });
    paint();
  }
  const q = root.querySelector?.('#knQuery');
  if (q && !q.dataset.bound) { q.dataset.bound = '1'; q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); root.querySelector('[data-action="knSearch"]')?.click(); } }); }
}

export const knowledgeUI = {financeHtml, graphHtml, searchResultsHtml, topicItemsHtml, topicForm, topicPayload, mountKnowledge};
