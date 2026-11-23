// [F1] Market workstation UI: home card, 行情 page (indices, breadth, movers, sector heat map, alerts), stock view
// with K line, and the K-line box used inside the quant detail. Pure HTML builders + one DOM mount for chart boxes.
import { escape } from './markdown.js';
import { num, pct, tone, bigNum, miniLine, heatColor, klineSvg, trendSvg, session, SESSION_LABEL, PERIODS, quoteFromBars, updateLiveBars } from '../shared/market.js';

const when = (date, t) => t ? date(t) : '';
const quoteCells = q => `<b data-live-price="${escape(q.code)}" class="mk-${tone(q.pct)}">${num(q.price)}</b><span data-live-field="pct" class="mk-${tone(q.pct)}">${pct(q.pct)}</span>`;
const stockBtn = (q, extra = '') => `<button class="mk-row" data-live-quote="${escape(q.code)}" data-action="mkStock" data-id="${escape(q.code)}"><span class="mk-name"><b>${escape(q.name || q.code)}</b><small>${escape(q.code)}</small></span>${extra}${quoteCells(q)}</button>`;

const liveTime = new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'});
const visible = el => !el.closest('[hidden], [aria-hidden="true"]') && (el.checkVisibility?.({visibilityProperty: true}) ?? true);
const visibleAll = (root, selector) => [...root.querySelectorAll(selector)].filter(visible);
const quoteUpdates = new WeakMap();

export function liveTargets(root) {
  if (root.hidden) return null;
  const charts = visibleAll(root, '[data-mk-code]').map(el => el.dataset.mkCode);
  const prices = visibleAll(root, '[data-live-price]').map(el => el.dataset.livePrice);
  const codes = [...new Set([...charts, ...prices].filter(code => /^\d{6}$/.test(code)))];
  return codes.length || visibleAll(root, '[data-live-idx]').length ? {codes} : null;
}

const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
const setTone = (el, pct) => {
  const next = `mk-${tone(pct)}`;
  if (!el.classList.contains(next)) { el.classList.remove('mk-up', 'mk-down', 'mk-flat'); el.classList.add(next); }
};
const idxChange = x => `${x.change != null ? (x.change > 0 ? '+' : '') + num(x.change) : ''} ${pct(x.pct)}`;
/** [v0.52.1] Patch the visible numbers in place from a market 'live' reply (no re-render, so scrolling, open menus and
 *  typing are not disturbed). Index tiles carry data-live-idx; prices data-live-price / data-live-pct with the code. */
export function patchLive(root, r = {}) {
  let n = 0;
  for (const x of r.indices || []) for (const el of visibleAll(root, `[data-live-idx="${x.secid}"]`)) {
    const b = el.querySelector('b'), s = el.querySelector('span');
    setText(b, num(x.price)); setText(s, idxChange(x)); setTone(el, x.pct); n++;
  }
  for (const [code, q] of Object.entries(r.quotes || {})) {
    for (const el of visibleAll(root, `[data-live-price="${code}"]`)) { const t = num(q.price); if (el.matches('.mk-qprice, .mk-row b')) setTone(el, q.pct); if (el.textContent !== t) { el.textContent = t; el.classList.remove('live-flash'); void el.offsetWidth; el.classList.add('live-flash'); } n++; }
    for (const el of visibleAll(root, `[data-live-pct="${code}"]`)) { setText(el, pct(q.pct)); const box = el.closest('[data-live-tone]') || el; box.classList.toggle('up', (q.pct || 0) >= 0); box.classList.toggle('down', (q.pct || 0) < 0); n++; }
  }
  for (const el of visibleAll(root, '[data-live-quote]')) {
    const q = r.quotes?.[el.dataset.liveQuote];
    if (!q) continue;
    const values = {...q, change: idxChange(q), pct: pct(q.pct), amount: bigNum(q.amount), turnover: pct(q.turnover).replace(/^\+/, '')};
    for (const field of el.querySelectorAll('[data-live-field]')) {
      const key = field.dataset.liveField;
      if (q[key] == null && !(key === 'change' && q.pct != null)) continue;
      setText(field, ['open', 'high', 'low', 'preClose'].includes(key) ? num(values[key]) : values[key]);
      if (key === 'change' || key === 'pct') setTone(field, q.pct);
    }
    el.querySelector('.mk-qasof')?.remove();
  }
  for (const box of visibleAll(root, '.mk-box')) {
    const q = r.quotes?.[box.dataset.mkCode];
    if (q) quoteUpdates.get(box)?.(q, r.at);
  }
  if (n && Number.isFinite(r.at)) for (const el of visibleAll(root, '[data-live-at]')) setText(el, '更新于 ' + liveTime.format(r.at));
  return n;
}
function indexTile(x, {big = false} = {}) {
  return `<button class="mk-idx mk-${tone(x.pct)}${big ? ' big' : ''}" data-page="market" data-live-idx="${escape(x.secid || '')}"><small>${escape(x.name)}</small><b>${num(x.price)}</b><span>${idxChange(x)}</span>${miniLine(x.mini, {w: big ? 160 : 110, h: big ? 40 : 30})}</button>`;
}
function breadthBar(b) {
  if (!b || (b.up == null && b.down == null)) return '';
  const up = b.up || 0, down = b.down || 0, flat = b.flat || 0, total = up + down + flat || 1;
  return `<div class="mk-breadth"><div class="mk-bbar"><i class="u" style="width:${(up / total * 100).toFixed(1)}%"></i><i class="f" style="width:${(flat / total * 100).toFixed(1)}%"></i><i class="d" style="width:${(down / total * 100).toFixed(1)}%"></i></div>
<div class="mk-bnums"><span class="mk-up">上涨 <b>${up}</b></span><span>平 <b>${flat}</b></span><span class="mk-down">下跌 <b>${down}</b></span>${b.limitUp != null ? `<span class="mk-up">涨停 <b>${b.limitUp}</b></span>` : ''}${b.limitDown != null ? `<span class="mk-down">跌停 <b>${b.limitDown}</b></span>` : ''}</div></div>`;
}
const status = o => `<span class="mk-session s-${o?.session || session()}">${SESSION_LABEL[o?.session || session()]}</span>`;

/** Home page card: index strip, breadth, leading sectors, link to the full page. */
export function marketHomeCard(state, {date = t => String(t)} = {}) {
  const o = state?.market?.overview;
  const head = `<div class="qk-card-head"><h2>市场行情${status(o)}</h2><div class="qk-card-tools"><small class="mk-at" data-live-at>${o ? '更新于 ' + escape(o.liveAt ? liveTime.format(o.liveAt) : when(date, o.at)) : ''}</small><button class="qk-more" data-page="market">查看行情 ›</button></div></div>`;
  if (!o) return `<section class="qk-card mk-home" id="mkHome">${head}<p class="qk-empty">正在获取大盘行情…（需要联网，数据来自公开行情接口）</p></section>`;
  const lead = (o.industry || []).slice(0, 4).map(s => `<button class="mk-chip mk-${tone(s.pct)}" data-action="mkSector" data-id="${escape(s.code)}">${escape(s.name)} <b>${pct(s.pct)}</b></button>`).join('');
  const warn = o.stale ? '<p class="mk-warn">行情接口暂时不可用，显示的是上次获取的数据。</p>' : o.partial ? '<p class="mk-warn">部分行情暂时没有取到，稍后会自动重试。</p>' : '';
  return `<section class="qk-card mk-home" id="mkHome">${head}${warn}<div class="mk-idx-row">${(o.indices || []).map(x => indexTile(x)).join('')}</div>${breadthBar(o.breadth)}${lead ? `<div class="mk-lead"><small>领涨行业</small>${lead}</div>` : ''}</section>`;
}

function heatmap(list, kind) {
  if (!list?.length) return '<p class="qk-empty">暂无板块数据</p>';
  return `<div class="mk-heat">${list.slice(0, 48).map(s => `<button class="mk-tile" style="background:${heatColor(s.pct)};color:${Math.abs(s.pct || 0) >= 3 ? '#fff' : '#1f2a44'}" data-action="mkSector" data-id="${escape(s.code)}" title="${escape(s.name)} ${pct(s.pct)}${s.leader ? ' · 领涨 ' + escape(s.leader.name) + ' ' + pct(s.leader.pct) : ''}"><b>${escape(s.name)}</b><span>${pct(s.pct)}</span>${s.leader ? `<small>${escape(s.leader.name)} ${pct(s.leader.pct)}</small>` : ''}</button>`).join('')}</div>`;
}

/** 行情 page. stock: code -> stock view; otherwise the overview. */
export function marketPage(state, {action, date = t => String(t), tab = 'industry', stock = ''}) {
  if (stock) return stockView(state, stock, {action});
  const o = state?.market?.overview;
  const tools = `${action('刷新', 'mkRefresh')}${action('＋ 价格提醒', 'mkAlert', '', 'primary')}`;
  if (!o) return `<div class="page market-page"><section class="fd-hero mk-hero"><div class="fd-hero-text"><span class="qk-pill">行情 · 实时公开行情</span><h1>市场行情</h1><p class="subtitle">正在获取指数、涨跌幅榜和板块数据…</p><div class="fd-tools">${tools}</div></div></section></div>`;
  const hero = `<section class="fd-hero mk-hero"><div class="fd-hero-text"><span class="qk-pill">行情 · ${escape(o.date || '')} ${SESSION_LABEL[o.session] || ''}</span><h1>今天的市场</h1><p class="subtitle">两市成交 ${bigNum(o.amount)}，${o.breadth?.up ?? '—'} 家上涨、${o.breadth?.down ?? '—'} 家下跌。交易时段指数和价格每秒刷新；也可以直接在对话里问「今天哪个板块最强」「宁德时代周 K 线」。</p><div class="fd-tools">${tools}<small class="mk-at" data-live-at>更新于 ${escape(o.liveAt ? liveTime.format(o.liveAt) : when(date, o.at))}</small></div></div></section>`;
  const idx = `<section class="qk-card"><div class="mk-idx-row big">${(o.indices || []).map(x => indexTile(x, {big: true})).join('')}</div>${breadthBar(o.breadth)}</section>`;
  const movers = (title, list) => `<section class="qk-card mk-movers"><div class="qk-card-head"><h2>${title}</h2></div>${(list || []).map(q => stockBtn(q, `<small class="mk-amt" data-live-field="amount">${bigNum(q.amount)}</small>`)).join('') || '<p class="qk-empty">暂无数据</p>'}</section>`;
  const tabs = `<div class="qk-card-tools mk-tabs">${[['industry', '行业'], ['concept', '概念']].map(([id, l]) => `<button type="button" class="${tab === id ? 'chosen' : ''}" data-action="mkTab" data-id="${id}">${l}</button>`).join('')}</div>`;
  const heat = `<section class="qk-card"><div class="qk-card-head"><h2>板块热力图<small>按涨跌幅着色 · 点击查看成分股</small></h2>${tabs}</div>${heatmap(tab === 'concept' ? o.concept : o.industry, tab)}</section>`;
  const alerts = state.market?.alerts || [];
  const alertBox = `<section class="qk-card mk-alerts"><div class="qk-card-head"><h2>价格提醒<small>${alerts.length} 条 · 交易时段每 15 秒检查一次</small></h2><div class="qk-card-tools">${action('＋ 添加', 'mkAlert')}</div></div>${alerts.length ? `<ul class="qk-list">${alerts.map(a => `<li><span class="qk-list-title">${escape(a.text)}</span>${action('删除', 'mkAlertRemove', a.id)}</li>`).join('')}</ul>` : '<p class="qk-empty">还没有提醒。可以在对话里说「宁德时代涨超 5% 提醒我」。自选股涨跌停和大幅异动也会自动提醒。</p>'}</section>`;
  return `<div class="page market-page">${hero}${idx}<div class="mk-grid2">${movers('涨幅榜', o.gainers)}${movers('跌幅榜', o.losers)}</div>${heat}${alertBox}<p class="auto-note">行情来自公开行情接口，可能有延迟，仅供研究，不构成投资建议。</p></div>`;
}

function stockView(state, code, {action}) {
  const inPool = (state.quant?.pool || []).some(p => p.code === code);
  const bar = `<div class="miniapp-bar">${action('← 行情', 'mkBack')}<h2 id="mkStockTitle">${escape(code)}</h2><span class="miniapp-tools">${inPool ? action('查看策略信号', 'quantOpen', code) : action('＋ 加入股票池', 'mkAddPool', code, 'primary')}${action('价格提醒', 'mkAlert', code)}</span></div>`;
  return `<div class="page market-page mk-stock">${bar}${klineBox(code, {big: true})}<p class="auto-note">K 线为前复权；行情来自公开行情接口，可能有延迟，仅供研究，不构成投资建议。</p></div>`;
}

const compactPeriods = new Set(['day', 'week', 'month', 'm5', 'intraday']);

/** K-line box; filled by mountKlineBoxes(). marks: [{date, type: 'buy'|'sell', text}] drawn on the daily chart. */
export function klineBox(code, {marks = [], big = false} = {}) {
  const btn = (k, v, l) => `<button type="button" data-mk="${k}:${v}">${l}</button>`;
  const periodButtons = Object.entries(PERIODS);
  const periods = periodButtons.map(([key, [, label]]) =>
    compactPeriods.has(key) ? btn('period', key, label) : `<span class="mk-wide-period">${btn('period', key, label)}</span>`).join('');
  const extra = periodButtons.filter(([key]) => !compactPeriods.has(key))
    .map(([key, [, label]]) => btn('period', key, label)).join('');
  const more = `<details class="mk-more"><summary aria-label="更多周期"><span>更多</span> ▾</summary><div class="mk-more-periods">${extra}</div></details>`;
  return `<section class="qk-card mk-box${big ? ' big' : ''}" data-mk-code="${escape(code)}" data-mk-marks="${escape(JSON.stringify(marks || []))}">
<div class="mk-quote"></div><div class="mk-toolbar"><div class="mk-seg mk-periods">${periods}${more}</div><div class="mk-seg">${btn('sub', 'macd', 'MACD')}${btn('sub', 'kdj', 'KDJ')}</div><div class="mk-seg">${btn('range', 60, '60')}${btn('range', 120, '120')}${btn('range', 250, '250')}</div></div>
<div class="mk-hover" aria-live="polite"></div><div class="mk-body"><p class="mk-empty">正在加载 K 线…</p></div></section>`;
}

export function quoteLine(d) {
  let q = d?.quote || {};
  if ((q.price === null || q.price === undefined) && d?.period === 'day' && d?.bars?.length) q = {...q, ...quoteFromBars(d.bars)}; // [v46] no live quote -> last daily bar
  const code = escape(d?.code || q.code || '');
  return `<div class="mk-qline" data-live-quote="${code}"><b class="mk-qname">${escape(d?.name || q.name || d?.code || '')}</b><small>${code}</small><b data-live-price="${code}" class="mk-qprice mk-${tone(q.pct)}">${num(q.price)}</b><span data-live-field="change" class="mk-${tone(q.pct)}">${q.change != null ? (q.change > 0 ? '+' : '') + num(q.change) : ''} ${pct(q.pct)}</span>
<span class="mk-qkv">开 <b data-live-field="open">${num(q.open)}</b></span><span class="mk-qkv">高 <b data-live-field="high">${num(q.high)}</b></span><span class="mk-qkv">低 <b data-live-field="low">${num(q.low)}</b></span><span class="mk-qkv">昨收 <b data-live-field="preClose">${num(q.preClose)}</b></span><span class="mk-qkv">成交额 <b data-live-field="amount">${bigNum(q.amount)}</b></span><span class="mk-qkv">换手 <b data-live-field="turnover">${pct(q.turnover).replace(/^\+/, '')}</b></span>${q.fromBars && q.asOf ? `<small class="mk-qasof">实时行情暂不可用，数据截至 ${escape(q.asOf)} 收盘</small>` : ''}</div>`;
}

const prefs = new Map(), kcache = new Map();
export function setKlinePeriod(code, period) {
  if (Object.hasOwn(PERIODS, period)) prefs.set(code, {...prefs.get(code), period});
}

// Update the SVG in place so the hovered column and crosshair retain their DOM nodes.
function syncChart(node, next) {
  for (const attr of [...node.attributes]) if (!next.hasAttribute(attr.name)) node.removeAttribute(attr.name);
  for (const attr of next.attributes) {
    if (node.classList.contains('mk-cross') && ['style', 'x1', 'x2'].includes(attr.name)) continue;
    if (node.getAttribute(attr.name) !== attr.value) node.setAttribute(attr.name, attr.value);
  }
  [...next.childNodes].forEach((child, i) => {
    const current = node.childNodes[i];
    if (!current) node.append(child.cloneNode(true));
    else if (current.nodeName !== child.nodeName) current.replaceWith(child.cloneNode(true));
    else if (child.nodeType === 1) syncChart(current, child);
    else if (current.nodeValue !== child.nodeValue) current.nodeValue = child.nodeValue;
  });
  while (node.childNodes.length > next.childNodes.length) node.lastChild.remove();
}
/** Fill every unbound .mk-box: fetch through call({action: 'kline', code, period}), cache 15 s (intraday) / 60 s. */
export function mountKlineBoxes(root, call, {now = Date.now} = {}) {
  for (const box of root.querySelectorAll('.mk-box[data-mk-code]')) {
    if (box.dataset.bound) continue;
    box.dataset.bound = '1';
    const code = box.dataset.mkCode, p = {period: 'day', sub: 'macd', range: 120, ...prefs.get(code)};
    const body = box.querySelector('.mk-body'), ql = box.querySelector('.mk-quote'), hv = box.querySelector('.mk-hover');
    ql.innerHTML = quoteLine({code});
    let request = 0, active, previous, hovered, latest, refreshAt = 0;
    const chart = d => {
      const w = Math.max(360, Math.round((body.clientWidth || box.clientWidth || 980) - 14));
      const h = box.classList.contains('big') ? 540 : 460;
      return p.period === 'intraday' ? trendSvg(d.points, d.preClose, {w, h: Math.round(h * 0.8)}) :
        klineSvg(d.bars, {sub: p.sub, last: p.range, marks: /^m\d+$/.test(p.period) ? [] : marks, w, h});
    };
    const hover = hit => {
      if (!hit) return;
      setText(hv, hit.dataset.t || '');
      const cross = box.querySelector('.mk-cross');
      if (cross) {
        const x = Number(hit.getAttribute('x')) + Number(hit.getAttribute('width')) / 2;
        cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.style.opacity = '.7';
      }
    };
    const patchChart = () => {
      const next = box.ownerDocument.createElement('template');
      next.innerHTML = chart(active);
      const current = body.firstElementChild;
      if (current?.matches('.mk-kline') && next.content.firstElementChild.matches('.mk-kline')) syncChart(current, next.content.firstElementChild);
      else body.replaceChildren(next.content);
      if (hovered != null) hover(body.querySelector(`[data-i="${hovered}"]`));
    };
    const tick = (quote, at) => {
      if (!Number.isFinite(at)) return;
      const gap = latest && at - latest.at;
      latest = {quote, at};
      if (!active) return;
      if (gap > 60e3 && /^m\d+$/.test(p.period) && at - refreshAt > 60e3) {
        // Restore candles elapsed while the window was hidden or the quote feed was unavailable.
        refreshAt = at;
        previous = undefined;
        void paint(true);
      }
      const update = updateLiveBars(active.bars || [], p.period, quote, at, previous);
      if (!update) return;
      previous = update.previous;
      if (!update.changed) return;
      active = {...active, bars: update.bars};
      patchChart();
    };
    quoteUpdates.set(box, tick);
    let marks = []; try { marks = JSON.parse(box.dataset.mkMarks || '[]'); } catch {}
    const more = box.querySelector('.mk-more');
    const moreButton = more.querySelector('summary');
    const paint = async (refresh = false) => {
      const revision = ++request;
      const period = p.period;
      for (const b of box.querySelectorAll('[data-mk]')) { const [k, v] = b.dataset.mk.split(':'); b.classList.toggle('chosen', String(p[k]) === v); b.disabled = p.period === 'intraday' && k !== 'period'; }
      const extraSelected = !compactPeriods.has(period);
      const moreLabel = extraSelected ? PERIODS[period][1] : '更多';
      moreButton.classList.toggle('chosen', extraSelected);
      moreButton.firstElementChild.textContent = moreLabel;
      moreButton.setAttribute('aria-label', extraSelected ? `更多周期，当前${moreLabel}` : '更多周期');
      if (!refresh && active?.period === period) { body.innerHTML = chart(active); setText(hv, ''); hovered = undefined; return; }
      if (!refresh) active = previous = undefined;
      const key = code + '|' + period, hit = kcache.get(key);
      const ttl = /^m\d+$/.test(period) ? 10e3 : period === 'intraday' ? 15e3 : 60e3;
      let d = !refresh && hit && now() - hit.at < ttl ? hit.data : null;
      if (!d) {
        if (!refresh) body.innerHTML = '<p class="mk-empty">正在加载…</p>';
        try { const out = await call({action: 'kline', code, period}); d = out?.result ?? out; kcache.set(key, {at: now(), data: d}); if (kcache.size > 60) kcache.delete(kcache.keys().next().value); }
        catch (e) { if (!refresh && revision === request) body.innerHTML = `<p class="task-error mk-down">${escape(String(e?.message || e).replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^(Type)?Error:\s*/, '').replace(/^fetch failed$/, '行情接口暂时连不上，请检查网络后点周期按钮重试'))}</p>`; return; } // [v47.1]
      }
      if (!box.isConnected || revision !== request) return;
      active = {...d, period};
      if (refresh) {
        previous = undefined;
        patchChart();
        if (latest) tick(latest.quote, latest.at);
        return;
      }
      ql.innerHTML = quoteLine({...d, code});
      const t = box.closest('.mk-stock')?.querySelector('#mkStockTitle');
      if (t && d?.name) t.textContent = `${d.name} ${d.code}`;
      body.innerHTML = chart(active);
      setText(hv, ''); hovered = undefined;
      if (latest && now() - latest.at < 3000) {
        patchLive(box, {quotes: {[code]: latest.quote}});
        tick(latest.quote, latest.at);
      }
    };
    box.addEventListener('mousemove', e => {
      const hit = e.target.closest?.('.mk-hit');
      if (hit) { hovered = hit.dataset.i; hover(hit); }
    });
    box.addEventListener('mouseleave', () => { hovered = undefined; setText(hv, ''); const cross = box.querySelector('.mk-cross'); if (cross) cross.style.opacity = '0'; });
    more.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !more.open) return;
      e.stopPropagation();
      more.open = false;
      moreButton.focus();
    });
    more.addEventListener('focusout', e => {
      if (!more.contains(e.relatedTarget)) more.open = false;
    });
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-mk]');
      if (!b || b.disabled) return;
      if (more.contains(b)) {
        more.open = false;
        moreButton.focus();
      }
      const [k, v] = b.dataset.mk.split(':');
      p[k] = k === 'range' ? Number(v) : v;
      prefs.set(code, p);
      paint();
    });
    paint();
  }
}

/** Overview poller: every 10 s while trading, 10 min otherwise; only while the home / 行情 page is visible. */
export function createMarketPoller({fetch, apply, active, age, now = Date.now}) {
  let busy = false, failedAt = 0;
  return async function poll() {
    if (busy || !active()) return;
    const s = session(now()), every = s === 'open' ? 10e3 : s === 'pre' || s === 'lunch' ? 60e3 : 600e3;
    if (now() - (age() || 0) < every || now() - failedAt < 60e3) return;
    busy = true;
    try { apply(await fetch()); } catch { failedAt = now(); } finally { busy = false; }
  };
}

export function marketAlertForm(code = '') {
  return `<label>股票（公司名称或 6 位代码）<input name="query" required maxlength="40" value="${escape(code)}" placeholder="例如 宁德时代 或 300750"></label>
<label>条件<select name="kind"><option value="up">涨幅达到（%）</option><option value="down">跌幅达到（%）</option><option value="above">价格涨到</option><option value="below">价格跌到</option></select></label>
<label>数值<input name="value" required inputmode="decimal" placeholder="例如 5 或 230"></label><p class="muted">交易时段每 15 秒检查一次，每条提醒每天最多触发一次，结果进入「动态」并发系统通知。</p>`;
}
const fv = (f, n) => String((typeof f?.get === 'function' ? f.get(n) : f?.elements?.[n]?.value) ?? '');
export const marketAlertPayload = f => ({query: fv(f, 'query').trim(), kind: fv(f, 'kind'), value: Number(fv(f, 'value'))});

export function sectorStocksView(r) {
  const list = r?.stocks || [];
  return list.length ? `<div class="mk-sector-list">${list.map(q => stockBtn(q, `<small class="mk-amt" data-live-field="amount">${bigNum(q.amount)}</small>`)).join('')}</div>` : '<p class="qk-empty">没有成分股数据</p>';
}

/** Buy / sell marks from the strategy's backtest operations (加仓 / 买入 / BUY = buy, 减仓 / 卖出 / SELL = sell).
 *  [v46] engines report English actions (BUY / STRONG_BUY / SELL); the hover text carries date, action, price, shares, reason. */
const BUY_RE = /加仓|买|BUY|ADD/i, SELL_RE = /减仓|卖|SELL|REDUCE|CLEAR|清仓/i;
export const opsMarks = ops => (ops || []).filter(o => o?.date && /^\d{4}-\d{2}-\d{2}/.test(String(o.date)) && (BUY_RE.test(String(o.action || '')) || SELL_RE.test(String(o.action || '')))).slice(-120).map(o => {
  const buy = !SELL_RE.test(String(o.action)) && BUY_RE.test(String(o.action));
  return {date: String(o.date).slice(0, 10), type: buy ? 'buy' : 'sell', text: [String(o.date).slice(0, 10), buy ? '买入' : '卖出', o.price != null ? `价格 ${o.price}` : '', o.shares != null ? `${o.shares} 股` : '', o.reason || ''].filter(Boolean).join(' · ')};
});
