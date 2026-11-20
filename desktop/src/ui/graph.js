// [p3-m5] 「知识图谱」 page, entity detail with a small neighbourhood diagram, edit / merge forms, sources under replies.
import { escape } from './markdown.js';
import { ENTITY_TYPES, TYPE_LABEL, relationsOf } from '../shared/graph.js';

const COLORS = {person: '#2563eb', org: '#0891b2', project: '#7c3aed', product: '#059669', event: '#d97706', place: '#db2777'};
const toggle = (id, on, label, hint) => `<button type="button" class="memory-toggle ${on ? 'on' : ''}" data-action="graphToggle" data-id="${id}" aria-pressed="${on}"><span class="switch"><i></i></span><span><b>${label}</b><small>${hint}</small></span></button>`;
const typeBadge = t => `<span class="graph-type" style="--c:${COLORS[t] || '#6b7280'}">${escape(TYPE_LABEL[t] || t)}</span>`;
const graphOf = state => ({entities: state.graph?.entities || [], relations: state.graph?.relations || []});

export function graphPage(state, {action, heading, empty, date, query = '', type = 'all'}) {
  const g = graphOf(state), cfg = state.graph?.settings || {}, st = state.graph?.status || {};
  const q = String(query || '').trim().toLowerCase();
  const counts = Object.fromEntries(ENTITY_TYPES.map(t => [t, g.entities.filter(e => e.type === t).length]));
  const list = g.entities.filter(e => (type === 'all' || e.type === type) && (!q || [e.name, e.summary, ...(e.aliases || [])].join(' ').toLowerCase().includes(q))).slice(0, 200);
  const head = heading('KNOWLEDGE GRAPH', '你工作中的人、公司和项目。', '从对话、文档和已连接的数据中整理实体和关系，对话里提到它们时会自动带上相关信息，回复下方标明用了哪些。整理时内容会发给你配置的模型（密钥、手机号等会先隐藏）；无痕对话不会被读取。',
    action(st.running ? '整理中…' : '立即整理', 'graphExtract', '', 'primary') + (g.entities.length ? action('清空图谱', 'graphClear', '', 'danger') : ''));
  const settings = `<div class="memory-settings">${toggle('enabled', cfg.enabled !== false, '对话时使用', '提到图谱里的名称时自动带上相关信息')}${toggle('autoExtract', cfg.autoExtract !== false, '自动整理', '应用运行时在后台整理新的内容')}${toggle('chats', cfg.chats !== false, '来自对话', '已完成的对话（无痕对话除外）')}${toggle('documents', cfg.documents !== false, '来自文档', '成果中心里的文档')}${toggle('connectors', cfg.connectors !== false, '来自连接', '邮件、日历、订阅、群消息')}</div>`;
  const status = `<p class="graph-status">${g.entities.length} 个实体 · ${g.relations.length} 条关系 · 待整理 ${st.pending || 0} 项 · 今天已整理 ${st.today || 0}/${st.cap || 100} 次${st.lastRun ? ' · 上次 ' + escape(date(st.lastRun)) : ''}${st.lastError ? `</p><p class="task-error">${escape(st.lastError)}` : ''}</p>`;
  const chip = (id, label, n) => `<button type="button" class="chip ${type === id ? 'chosen' : ''}" data-action="graphType" data-id="${id}">${label} <small>${n}</small></button>`;
  const tools = `<div class="memory-tools">${chip('all', '全部', g.entities.length)}${ENTITY_TYPES.filter(t => counts[t]).map(t => chip(t, TYPE_LABEL[t], counts[t])).join('')}<input id="graphQuery" type="search" placeholder="搜索名称、别名或描述" value="${escape(query)}"></div>`;
  const cards = list.map(e => {
    const rels = relationsOf(g, e.id).slice(0, 3);
    return `<div class="card graph-card" data-entity="${escape(e.id)}"><div class="graph-head"><h3>${escape(e.name)}</h3>${typeBadge(e.type)}${e.userEdited ? '<small>已手动编辑</small>' : ''}</div>
${e.aliases?.length ? `<small class="graph-alias">又称 ${escape(e.aliases.slice(0, 4).join('、'))}</small>` : ''}${e.summary ? `<p>${escape(e.summary)}</p>` : ''}
${rels.length ? `<ul class="graph-rels">${rels.map(r => `<li>${escape(r.fromName)} <b>${escape(r.type)}</b> ${escape(r.toName)}</li>`).join('')}</ul>` : ''}
<div class="actions">${action('详情', 'graphOpen', e.id)}${action('编辑', 'graphEdit', e.id)}${action('删除', 'graphRemove', e.id)}</div></div>`;
  }).join('');
  const body = g.entities.length ? (list.length ? `<div class="cards">${cards}</div>` : '<p class="panel-note">没有符合条件的实体。</p>')
    : empty('图谱还是空的', st.pending ? '点「立即整理」，或稍等片刻让它在后台自动整理。' : '和助手聊聊你的客户、同事和项目，或者添加文档、连接邮件和日历，这里会逐渐丰富起来。');
  return `<div class="page">${head}${settings}${status}${g.entities.length ? tools : ''}${body}</div>`;
}

/** Radial neighbourhood: the entity in the middle, up to 12 neighbours around it. */
export function neighbourhoodSvg(graph, id) {
  const e = graph.entities.find(x => x.id === id);
  if (!e) return '';
  const rels = relationsOf(graph, id).filter(r => r.other).slice(0, 12), W = 520, H = 300, cx = W / 2, cy = H / 2;
  const nodes = rels.map((r, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(rels.length, 1); return {r, x: cx + Math.cos(a) * 200, y: cy + Math.sin(a) * 110}; });
  const label = (s, n = 10) => escape(s.length > n ? s.slice(0, n) + '…' : s);
  return `<svg class="graph-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(e.name)} 的关系图">${nodes.map(n => `<line x1="${cx}" y1="${cy}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}"/><text class="edge" x="${((cx + n.x) / 2).toFixed(1)}" y="${((cy + n.y) / 2 - 4).toFixed(1)}">${label(n.r.type, 6)}</text>`).join('')}
${nodes.map(n => `<g class="node"><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="7" fill="${COLORS[n.r.other.type] || '#6b7280'}"/><text x="${n.x.toFixed(1)}" y="${(n.y + 20).toFixed(1)}">${label(n.r.other.name)}</text></g>`).join('')}
<circle cx="${cx}" cy="${cy}" r="11" fill="${COLORS[e.type] || '#6b7280'}"/><text class="center" x="${cx}" y="${cy + 26}">${label(e.name, 14)}</text></svg>`;
}

export function graphDetail(state, id, {action, date}) {
  const g = graphOf(state), e = g.entities.find(x => x.id === id);
  if (!e) return '<p class="empty-note">实体不存在或已删除。</p>';
  const rels = relationsOf(g, id);
  return `<div class="graph-detail"><div class="graph-head">${typeBadge(e.type)}${e.aliases?.length ? `<small>又称 ${escape(e.aliases.join('、'))}</small>` : ''}</div>${e.summary ? `<p>${escape(e.summary)}</p>` : ''}
${rels.length ? neighbourhoodSvg(g, id) : ''}
<h4>关系（${rels.length}）</h4>${rels.length ? `<ul class="graph-rel-list">${rels.map(r => `<li><span>${escape(r.fromName)} <b>${escape(r.type)}</b> ${escape(r.toName)}</span>${action('删除', 'graphRemoveRelation', r.id)}</li>`).join('')}</ul>` : '<p class="panel-note">还没有关系。</p>'}
<h4>来源</h4>${(e.sources || []).length ? `<ul class="graph-src">${e.sources.map(s => `<li>${escape(s.key.startsWith('chat:') ? '对话' : s.key.startsWith('doc:') ? '文档' : '连接')} · ${escape(s.title)} · ${escape(date(s.time))}</li>`).join('')}</ul>` : '<p class="panel-note">手动整理</p>'}
<div class="actions">${action('编辑', 'graphEdit', e.id)}${action('合并到…', 'graphMerge', e.id)}${action('删除', 'graphRemove', e.id)}</div></div>`;
}

export function graphEntityForm(e) {
  return `<div class="task-form"><label>名称<input name="name" required maxlength="60" value="${escape(e?.name || '')}"></label>
<label>类型<select name="type">${ENTITY_TYPES.map(t => `<option value="${t}" ${e?.type === t ? 'selected' : ''}>${TYPE_LABEL[t]}</option>`).join('')}</select></label>
<label>别名（用逗号分隔）<input name="aliases" value="${escape((e?.aliases || []).join('，'))}"></label>
<label>描述<textarea name="summary" rows="3" maxlength="300">${escape(e?.summary || '')}</textarea></label>
<p class="task-form-note">手动编辑后，自动整理不会再覆盖描述和类型。</p></div>`;
}
export function graphEntityPayload(f, id) {
  return {action: 'edit', id, name: String(f.get('name') || ''), type: String(f.get('type') || ''), aliases: String(f.get('aliases') || ''), summary: String(f.get('summary') || '')};
}
export function graphMergeForm(state, id) {
  const g = graphOf(state), e = g.entities.find(x => x.id === id);
  const others = g.entities.filter(x => x.id !== id).sort((a, b) => (b.type === e?.type) - (a.type === e?.type) || a.name.localeCompare(b.name, 'zh'));
  return `<div class="task-form"><p class="task-form-note">把「${escape(e?.name || '')}」合并到另一个实体：名称变成别名，关系和来源一起转过去。</p>
<label>合并到<select name="into">${others.slice(0, 500).map(x => `<option value="${escape(x.id)}">${escape(x.name)}（${escape(TYPE_LABEL[x.type] || '')}）</option>`).join('')}</select></label></div>`;
}

/** Under an assistant reply: entities that were sent with this turn. */
export function graphSources(m, action) {
  const used = Array.isArray(m?.entities) ? m.entities : [];
  if (!used.length) return '';
  return `<details class="memory-sources graph-sources"><summary>参考了知识图谱中的 ${used.length} 个实体</summary><div class="graph-chips">${used.map(x => `<button type="button" class="chip" data-action="graphOpen" data-id="${escape(x.id)}">${escape(x.name)}<small>${escape(TYPE_LABEL[x.type] || '')}</small></button>`).join('')}</div></details>`;
}
