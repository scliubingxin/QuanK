// [ux4] 「我的上下文」: tab header shared by 知识图谱 / 记忆, a force-directed knowledge-graph canvas (AWS Quick style),
// list view, floating legend, side panel and settings form. Pure HTML builders + one canvas mount; no external libraries.
import { escape } from './markdown.js';
import { ENTITY_TYPES, TYPE_LABEL } from '../shared/graph.js';
import { graphDetail } from './graph.js';

export const TYPE_COLOR = {person: '#4f46e5', org: '#d97706', project: '#0891b2', product: '#8b5cf6', event: '#0f766e', place: '#db2777'};
export const MAX_NODES = 600;
const REFRESH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm6-2 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

export function contextHeader(state, {tab, date}) {
  const st = state.graph?.status || {};
  const tabs = [['graph', '知识图谱'], ['context', '记忆库']].map(([id, l]) => `<button type="button" role="tab" class="ctx-tab ${tab === id ? 'chosen' : ''}" aria-selected="${tab === id}" data-page="${id}">${l}</button>`).join('');
  const right = tab === 'graph'
    ? `<span class="ctx-updated">${st.running ? '正在整理…' : st.lastRun ? '上次整理 ' + escape(date(st.lastRun)) : '尚未整理'}${st.pending ? ` · 待整理 ${st.pending} 项` : ''}</span><button type="button" class="ctx-icon" data-action="graphExtract" title="立即整理" aria-label="立即整理">${REFRESH}</button><button type="button" class="ctx-settings" data-action="graphSettings">设置</button>`
    : '';
  return `<div class="ctx-head"><h1>智能记忆</h1><div class="ctx-tabs" role="tablist">${tabs}</div><div class="ctx-right">${right}</div></div>`;
}

/** Nodes / edges to draw. Search keeps matches and their direct neighbours; focus keeps one entity and its neighbours. */
export function graphData(graph, {type = 'all', query = '', focus = '', limit = MAX_NODES} = {}) {
  const ents = graph?.entities || [], rels = graph?.relations || [], deg = new Map();
  for (const r of rels) { deg.set(r.from, (deg.get(r.from) || 0) + 1); deg.set(r.to, (deg.get(r.to) || 0) + 1); }
  const byType = e => type === 'all' || e.type === type;
  const q = String(query || '').trim().toLowerCase();
  const matched = q ? new Set(ents.filter(e => byType(e) && [e.name, e.summary, ...(e.aliases || [])].join(' ').toLowerCase().includes(q)).map(e => e.id)) : null;
  const around = seed => { const s = new Set(seed); for (const r of rels) { if (seed.has(r.from)) s.add(r.to); if (seed.has(r.to)) s.add(r.from); } return s; };
  let keep;
  if (focus && ents.some(e => e.id === focus)) { const s = around(new Set([focus])); keep = ents.filter(e => s.has(e.id)); }
  else if (matched) { const s = around(matched); keep = ents.filter(e => s.has(e.id)); }
  else keep = ents.filter(byType);
  const candidates = keep.length;
  keep = [...keep].sort((a, b) => (b.id === focus) - (a.id === focus) || (deg.get(b.id) || 0) - (deg.get(a.id) || 0) || (b.mentions || 0) - (a.mentions || 0)).slice(0, limit);
  const ids = new Set(keep.map(e => e.id));
  return {
    nodes: keep.map(e => ({id: e.id, name: e.name, type: e.type, degree: deg.get(e.id) || 0, match: matched ? matched.has(e.id) : false})),
    edges: rels.filter(r => r.from !== r.to && ids.has(r.from) && ids.has(r.to)).map(r => ({id: r.id, from: r.from, to: r.to, type: r.type})),
    total: ents.length, shown: keep.length, truncated: candidates > keep.length, matches: matched ? matched.size : null,
  };
}

const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
/** Force layout (grid-accelerated repulsion, springs, weak gravity). Positions persist in cache.pos across re-renders. */
export function createLayout(data, cache = {}) {
  const pos = cache.pos || (cache.pos = new Map()), n = data.nodes.length, R = Math.max(80, Math.sqrt(n) * 30);
  const nodes = data.nodes.map(d => {
    const p = pos.get(d.id), h = hash(d.id), a = (h % 3600) / 3600 * 2 * Math.PI, r = R * Math.sqrt(((h >>> 12) % 1000 + 1) / 1001);
    return {...d, x: p ? p.x : Math.cos(a) * r, y: p ? p.y : Math.sin(a) * r, vx: 0, vy: 0, fixed: false};
  });
  const index = new Map(nodes.map((d, i) => [d.id, i]));
  const links = data.edges.map(e => [index.get(e.from), index.get(e.to)]).filter(([a, b]) => a !== undefined && b !== undefined);
  const fresh = nodes.filter(d => !pos.has(d.id)).length;
  let alpha = !fresh ? 0 : fresh > n * 0.3 ? 1 : 0.4;
  const CELL = 70, CUT = 150 * 150;
  function step() {
    if (alpha < 0.004) return false;
    const grid = new Map();
    nodes.forEach((d, i) => { const k = Math.floor(d.x / CELL) * 73856093 ^ Math.floor(d.y / CELL) * 19349663; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i); });
    for (let i = 0; i < n; i++) {
      const a = nodes[i], cx = Math.floor(a.x / CELL), cy = Math.floor(a.y / CELL);
      for (let gx = cx - 2; gx <= cx + 2; gx++) for (let gy = cy - 2; gy <= cy + 2; gy++) {
        const list = grid.get(gx * 73856093 ^ gy * 19349663);
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 > CUT) continue;
          if (d2 < 0.01) { dx = ((i - j) % 7 + 0.5) * 0.1; dy = 0.1; d2 = dx * dx + dy * dy; }
          const f = 700 * alpha / d2;
          a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
        }
      }
    }
    for (const [i, j] of links) {
      const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 42) / d * 0.08 * alpha;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const d of nodes) {
      if (d.fixed) { d.vx = d.vy = 0; pos.set(d.id, {x: d.x, y: d.y}); continue; }
      d.vx = (d.vx - d.x * 0.006 * alpha) * 0.58; d.vy = (d.vy - d.y * 0.006 * alpha) * 0.58;
      const s = Math.hypot(d.vx, d.vy); if (s > 25) { d.vx *= 25 / s; d.vy *= 25 / s; }
      d.x += d.vx; d.y += d.vy;
      pos.set(d.id, {x: d.x, y: d.y});
    }
    alpha *= 0.97;
    return true;
  }
  return {nodes, links, step, get alpha() { return alpha; }, reheat(a = 0.3) { alpha = Math.max(alpha, a); },
    settle(max = 300) { let k = 0; while (k < max && step()) k++; return k; }};
}

export const radius = d => 3 + Math.min(7, Math.sqrt(d.degree || 0) * 1.4);

/** Canvas view with zoom / pan / drag / click / double-click. Returns {select(id), fit(), dispose()}. */
export function mountGraphCanvas(host, data, {cache = {}, selected = '', onSelect = () => {}, onFocus = () => {}} = {}) {
  const doc = host.ownerDocument, win = doc.defaultView;
  if (typeof win.CanvasRenderingContext2D !== 'function') { host.innerHTML = '<p class="graph-fallback">当前环境无法绘制图谱，请切换到「列表」查看。</p>'; return {select() {}, fit() {}, dispose() {}}; }
  const canvas = doc.createElement('canvas'), ctx = canvas.getContext('2d');
  host.replaceChildren(canvas);
  const L = createLayout(data, cache), byId = new Map(L.nodes.map(d => [d.id, d]));
  const adj = new Map(L.nodes.map(d => [d.id, new Set()]));
  for (const [i, j] of L.links) { adj.get(L.nodes[i].id).add(L.nodes[j].id); adj.get(L.nodes[j].id).add(L.nodes[i].id); }
  const view = cache.view || (cache.view = {k: 1, x: 0, y: 0, fitted: false});
  const top = new Set([...L.nodes].sort((a, b) => b.degree - a.degree).slice(0, 12).filter(d => d.degree > 0).map(d => d.id));
  let hover = '', sel = byId.has(selected) ? selected : '', raf = 0, disposed = false, dirty = true, drag = null;
  const size = () => ({w: host.clientWidth || 800, h: host.clientHeight || 520});
  function fit() {
    if (!L.nodes.length) return;
    const {w, h} = size();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const d of L.nodes) { x0 = Math.min(x0, d.x); y0 = Math.min(y0, d.y); x1 = Math.max(x1, d.x); y1 = Math.max(y1, d.y); }
    const k = Math.max(0.2, Math.min(2.2, Math.min((w - 120) / Math.max(1, x1 - x0), (h - 120) / Math.max(1, y1 - y0))));
    Object.assign(view, {k, x: -(x0 + x1) / 2 * k, y: -(y0 + y1) / 2 * k, fitted: true});
    dirty = true;
  }
  if (L.alpha > 0.5) L.settle(L.nodes.length > 400 ? 180 : 260);
  if (!view.fitted || cache.refit) { fit(); cache.refit = false; }
  const toWorld = (sx, sy) => { const {w, h} = size(); return {x: (sx - w / 2 - view.x) / view.k, y: (sy - h / 2 - view.y) / view.k}; };
  const hit = (sx, sy) => {
    const p = toWorld(sx, sy);
    let best = null, bd = Infinity;
    for (const d of L.nodes) { const dd = Math.hypot(d.x - p.x, d.y - p.y), r = Math.max(radius(d), 7 / view.k); if (dd <= r && dd < bd) { bd = dd; best = d; } }
    return best;
  };
  function draw() {
    const {w, h} = size(), dpr = win.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const focusId = hover || sel, near = focusId ? new Set([focusId, ...(adj.get(focusId) || [])]) : null;
    ctx.save(); ctx.translate(w / 2 + view.x, h / 2 + view.y); ctx.scale(view.k, view.k);
    ctx.lineWidth = 0.7 / view.k; ctx.strokeStyle = near ? 'rgba(100,116,139,.10)' : 'rgba(100,116,139,.30)';
    ctx.setLineDash([3 / view.k, 2 / view.k]); ctx.beginPath();
    for (const [i, j] of L.links) { const a = L.nodes[i], b = L.nodes[j]; if (near && (a.id === focusId || b.id === focusId)) continue; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.stroke(); ctx.setLineDash([]);
    if (near) {
      ctx.lineWidth = 1.4 / view.k; ctx.strokeStyle = 'rgba(0,120,203,.75)'; ctx.beginPath();
      for (const [i, j] of L.links) { const a = L.nodes[i], b = L.nodes[j]; if (a.id === focusId || b.id === focusId) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } }
      ctx.stroke();
    }
    for (const d of L.nodes) {
      ctx.globalAlpha = near && !near.has(d.id) ? 0.22 : 1;
      ctx.beginPath(); ctx.arc(d.x, d.y, radius(d), 0, Math.PI * 2); ctx.fillStyle = TYPE_COLOR[d.type] || '#6b7280'; ctx.fill();
      if (d.match || d.id === sel) { ctx.lineWidth = 2 / view.k; ctx.strokeStyle = d.id === sel ? '#0078cb' : '#111827'; ctx.stroke(); }
    }
    ctx.globalAlpha = 1; ctx.restore();
    ctx.font = '12px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    const labelled = L.nodes.filter(d => near ? near.has(d.id) : d.match || top.has(d.id) || view.k >= 1.8);
    for (const d of labelled.slice(0, 160)) {
      const sx = w / 2 + view.x + d.x * view.k, sy = h / 2 + view.y + (d.y + radius(d)) * view.k + 13;
      if (sx < -50 || sx > w + 50 || sy < -20 || sy > h + 20) continue;
      const t = d.name.length > 18 ? d.name.slice(0, 18) + '…' : d.name;
      ctx.font = (d.id === focusId ? '600 ' : '') + '12px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.strokeText(t, sx, sy);
      ctx.fillStyle = '#1f2937'; ctx.fillText(t, sx, sy);
    }
  }
  function loop() { if (disposed) return; const moved = L.step(); if (moved || dirty) { draw(); dirty = false; } raf = win.requestAnimationFrame(loop); }
  const pt = e => { const r = canvas.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
  canvas.addEventListener('pointerdown', e => {
    const p = pt(e), node = hit(p.x, p.y);
    drag = {node, sx: p.x, sy: p.y, x: view.x, y: view.y, moved: false};
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    const p = pt(e);
    if (drag) {
      if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 3) drag.moved = true;
      if (drag.node && drag.moved) { const w = toWorld(p.x, p.y); Object.assign(drag.node, {x: w.x, y: w.y, fixed: true}); L.reheat(0.12); }
      else if (!drag.node) { view.x = drag.x + p.x - drag.sx; view.y = drag.y + p.y - drag.sy; }
      dirty = true; return;
    }
    const n = hit(p.x, p.y), id = n ? n.id : '';
    if (id !== hover) { hover = id; canvas.style.cursor = id ? 'pointer' : 'grab'; dirty = true; }
  });
  const up = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.node) { d.node.fixed = false; if (!d.moved) { sel = d.node.id; dirty = true; onSelect(sel); } }
    else if (!d.moved && sel) { sel = ''; dirty = true; onSelect(''); }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => { if (hover && !drag) { hover = ''; dirty = true; } });
  canvas.addEventListener('dblclick', e => { const p = pt(e), n = hit(p.x, p.y); cache.refit = true; onFocus(n ? n.id : ''); });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const p = pt(e), {w, h} = size(), k = Math.max(0.15, Math.min(6, view.k * Math.exp(-e.deltaY * 0.0015)));
    const wx = (p.x - w / 2 - view.x) / view.k, wy = (p.y - h / 2 - view.y) / view.k;
    view.x = p.x - w / 2 - wx * k; view.y = p.y - h / 2 - wy * k; view.k = k; dirty = true;
  }, {passive: false});
  const ro = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => { dirty = true; }) : null;
  ro?.observe(host);
  canvas.style.cursor = 'grab';
  raf = win.requestAnimationFrame(loop);
  return {
    select(id) { sel = byId.has(id) ? id : ''; dirty = true; },
    fit() { fit(); },
    dispose() { disposed = true; win.cancelAnimationFrame(raf); ro?.disconnect(); },
  };
}

function legend(state, type) {
  const ents = state.graph?.entities || [], counts = Object.fromEntries(ENTITY_TYPES.map(t => [t, ents.filter(e => e.type === t).length]));
  const rows = ENTITY_TYPES.filter(t => counts[t]).sort((a, b) => counts[b] - counts[a]).map(t => `<button type="button" class="legend-row ${type === t ? 'chosen' : ''} ${type !== 'all' && type !== t ? 'dim' : ''}" data-action="graphType" data-id="${t}"><i style="background:${TYPE_COLOR[t]}"></i><span>${TYPE_LABEL[t]}</span><small>${counts[t]}</small></button>`).join('');
  return `<div class="graph-legend">${rows}<button type="button" class="legend-all" data-action="graphMode" data-id="list">☰ 浏览全部</button></div>`;
}

export function graphSidePanel(state, id, {action, date}) {
  const e = (state.graph?.entities || []).find(x => x.id === id);
  if (!e) return '';
  return `<header><b>${escape(e.name)}</b><button type="button" class="ctx-icon" data-action="graphClose" aria-label="关闭">×</button></header>` +
    graphDetail(state, id, {action, date}).replace(/<svg class="graph-svg"[\s\S]*?<\/svg>/, '');
}

function listView(state, {action, type, query}) {
  const rels = state.graph?.relations || [], deg = new Map();
  for (const r of rels) { deg.set(r.from, (deg.get(r.from) || 0) + 1); deg.set(r.to, (deg.get(r.to) || 0) + 1); }
  const q = String(query || '').trim().toLowerCase();
  const rows = (state.graph?.entities || []).filter(e => (type === 'all' || e.type === type) && (!q || [e.name, e.summary, ...(e.aliases || [])].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (deg.get(b.id) || 0) - (deg.get(a.id) || 0) || (b.mentions || 0) - (a.mentions || 0));
  const chips = `<div class="graph-type-chips"><button type="button" class="chip ${type === 'all' ? 'chosen' : ''}" data-action="graphType" data-id="all">全部</button>${ENTITY_TYPES.map(t => `<button type="button" class="chip ${type === t ? 'chosen' : ''}" data-action="graphType" data-id="${t}"><i style="background:${TYPE_COLOR[t]}"></i>${TYPE_LABEL[t]}</button>`).join('')}</div>`;
  if (!rows.length) return chips + '<p class="panel-note">没有符合条件的实体。</p>';
  return chips + `<div class="graph-list"><table><thead><tr><th>名称</th><th>类型</th><th>描述</th><th>关系</th><th></th></tr></thead><tbody>${rows.slice(0, 300).map(e => `<tr>
<td><button type="button" class="link-btn" data-action="graphOpen" data-id="${escape(e.id)}">${escape(e.name)}</button>${e.aliases?.length ? `<small>${escape(e.aliases.slice(0, 3).join('、'))}</small>` : ''}</td>
<td><span class="type-dot"><i style="background:${TYPE_COLOR[e.type] || '#6b7280'}"></i>${escape(TYPE_LABEL[e.type] || e.type)}</span></td>
<td class="desc">${escape(e.summary || '')}</td><td>${deg.get(e.id) || 0}</td>
<td class="row-actions"><button type="button" data-action="graphEdit" data-id="${escape(e.id)}">编辑</button><button type="button" data-action="graphRemove" data-id="${escape(e.id)}">删除</button></td></tr>`).join('')}</tbody></table>${rows.length > 300 ? `<p class="panel-note">显示前 300 个，共 ${rows.length} 个，可用搜索缩小范围。</p>` : ''}</div>`;
}

export function contextGraphPage(state, {action, date, query = '', type = 'all', mode = 'graph', focus = '', selected = ''}) {
  const ents = state.graph?.entities || [], st = state.graph?.status || {};
  const head = contextHeader(state, {tab: 'graph', date});
  if (!ents.length) return `<div class="page context-page">${head}<div class="graph-empty"><h3>图谱还是空的</h3><p>和助手聊聊你的客户、同事和项目，或者添加文档、连接邮件和日历；QuanK 会用你配置的模型在后台整理出人、公司、项目和它们之间的关系。</p>${st.pending ? action('立即整理', 'graphExtract', '', 'primary') : ''}${st.lastError ? `<p class="task-error">${escape(st.lastError)}</p>` : ''}</div></div>`;
  const data = graphData(state.graph, {type, query, focus});
  const focusName = focus ? ents.find(e => e.id === focus)?.name : '';
  const toolbar = `<div class="graph-toolbar"><label class="graph-search">${SEARCH}<input id="graphQuery" type="search" placeholder="搜索实体" value="${escape(query)}" autocomplete="off"></label>
<div class="seg" role="tablist"><button type="button" class="${mode === 'graph' ? 'chosen' : ''}" data-action="graphMode" data-id="graph" title="图谱">图谱</button><button type="button" class="${mode === 'list' ? 'chosen' : ''}" data-action="graphMode" data-id="list" title="列表">列表</button></div>
${focusName ? `<span class="focus-chip">聚焦：${escape(focusName)}<button type="button" data-action="graphUnfocus" aria-label="取消聚焦">×</button></span>` : ''}${type !== 'all' ? `<span class="focus-chip">${escape(TYPE_LABEL[type] || type)}<button type="button" data-action="graphType" data-id="all" aria-label="显示全部类型">×</button></span>` : ''}
${mode === 'graph' ? `<button type="button" class="ctx-settings" data-action="graphFit">适应窗口</button>` : ''}${st.lastError ? `<span class="graph-error" title="${escape(st.lastError)}">整理出错</span>` : ''}</div>`;
  if (mode === 'list') return `<div class="page context-page">${head}${toolbar}${listView(state, {action, type, query})}</div>`;
  const note = data.matches === 0 ? '<p class="graph-note">没有找到匹配的实体</p>' : data.truncated ? `<p class="graph-note">显示关系最多的 ${data.shown} 个实体（共 ${data.total} 个），可搜索或按类型筛选</p>` : '';
  const sideHtml = selected ? graphSidePanel(state, selected, {action, date}) : '';
  return `<div class="page context-page">${head}${toolbar}<div class="graph-stage"><div id="graphCanvas" class="graph-canvas"></div>${legend(state, type)}${note}<aside id="graphSide" class="graph-side" ${sideHtml ? '' : 'hidden'}>${sideHtml}</aside><div class="graph-hint">单击选中 · 双击聚焦 · 滚轮缩放 · 拖动平移</div></div></div>`;
}

export function graphSettingsForm(state) {
  const cfg = state.graph?.settings || {}, st = state.graph?.status || {}, g = state.graph || {};
  const toggle = (id, label, hint) => `<button type="button" class="memory-toggle ${cfg[id] !== false ? 'on' : ''}" data-action="graphSettingToggle" data-id="${id}" aria-pressed="${cfg[id] !== false}"><span class="switch"><i></i></span><span><b>${label}</b><small>${hint}</small></span></button>`;
  return `<div class="graph-settings"><p class="description">整理时内容会发给你配置的模型（密钥、手机号等会先隐藏）；无痕对话不会被读取。</p>
<div class="memory-settings">${toggle('enabled', '对话时使用', '提到图谱里的名称时自动带上相关信息')}${toggle('autoExtract', '自动整理', '应用运行时在后台整理新的内容')}${toggle('chats', '来自对话', '已完成的对话（无痕对话除外）')}${toggle('documents', '来自文档', '成果中心里的文档')}${toggle('connectors', '来自连接', '邮件、日历、订阅、群消息')}</div>
<p class="graph-status">${(g.entities || []).length} 个实体 · ${(g.relations || []).length} 条关系 · 待整理 ${st.pending || 0} 项 · 今天已整理 ${st.today || 0}/${st.cap || 100} 次</p>
${st.lastError ? `<p class="task-error">${escape(st.lastError)}</p>` : ''}<div class="actions"><button type="button" class="danger" data-action="graphClear">清空图谱</button></div></div>`;
}
