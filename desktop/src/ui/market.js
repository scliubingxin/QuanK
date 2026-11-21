// [F1] Market workstation UI: home card, 行情 page (indices, breadth, movers, sector heat map, alerts), stock view
// with K line, and the K-line box used inside the quant detail. Pure HTML builders + one DOM mount for chart boxes.
import { escape } from './markdown.js';
import { num, pct, tone, bigNum, miniLine, heatColor, klineSvg, trendSvg, session, SESSION_LABEL, PERIODS } from '../shared/market.js';

const when = (date, t) => t ? date(t) : '';
const quoteCells = q => `<b class="mk-${tone(q.pct)}">${num(q.price)}</b><span class="mk-${tone(q.pct)}">${pct(q.pct)}</span>`;
const stockBtn = (q, extra = '') => `<button class="mk-row" data-action="mkStock" data-id="${escape(q.code)}"><span class="mk-name"><b>${escape(q.name || q.code)}</b><small>${escape(q.code)}</small></span>${extra}${quoteCells(q)}</button>`;

function indexTile(x, {big = false} = {}) {
  return `<button class="mk-idx mk-${tone(x.pct)}${big ? ' big' : ''}" data-page="market"><small>${escape(x.name)}</small><b>${num(x.price)}</b><span>${x.change != null ? (x.change > 0 ? '+' : '') + num(x.change) : ''} ${pct(x.pct)}</span>${miniLine(x.mini, {w: big ? 160 : 110, h: big ? 40 : 30})}</button>`;
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
  const head = `<div class="qk-card-head"><h2>市场行情${status(o)}</h2><div class="qk-card-tools"><small class="mk-at">${o ? '更新于 ' + escape(when(date, o.at)) : ''}</small><button class="qk-more" data-page="market">查看行情 ›</button></div></div>`;
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
  const hero = `<section class="fd-hero mk-hero"><div class="fd-hero-text"><span class="qk-pill">行情 · ${escape(o.date || '')} ${SESSION_LABEL[o.session] || ''}</span><h1>今天的市场</h1><p class="subtitle">两市成交 ${bigNum(o.amount)}，${o.breadth?.up ?? '—'} 家上涨、${o.breadth?.down ?? '—'} 家下跌。交易时段每 10 秒自动刷新；也可以直接在对话里问「今天哪个板块最强」「宁德时代周 K 线」。</p><div class="fd-tools">${tools}<small class="mk-at">更新于 ${escape(when(date, o.at))}</small></div></div></section>`;
  const idx = `<section class="qk-card"><div class="mk-idx-row big">${(o.indices || []).map(x => indexTile(x, {big: true})).join('')}</div>${breadthBar(o.breadth)}</section>`;
  const movers = (title, list) => `<section class="qk-card mk-movers"><div class="qk-card-head"><h2>${title}</h2></div>${(list || []).map(q => stockBtn(q, `<small class="mk-amt">${bigNum(q.amount)}</small>`)).join('') || '<p class="qk-empty">暂无数据</p>'}</section>`;
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

/** K-line box; filled by mountKlineBoxes(). marks: [{date, type: 'buy'|'sell', text}] drawn on the daily chart. */
export function klineBox(code, {marks = [], big = false} = {}) {
  const btn = (k, v, l) => `<button type="button" data-mk="${k}:${v}">${l}</button>`;
  const periods = Object.entries(PERIODS).filter(([k]) => k !== 'm30').map(([k, [, l]]) => btn('period', k, l)).join('');
  return `<section class="qk-card mk-box${big ? ' big' : ''}" data-mk-code="${escape(code)}" data-mk-marks="${escape(JSON.stringify(marks || []))}">
<div class="mk-quote"></div><div class="mk-toolbar"><div class="mk-seg">${periods}</div><div class="mk-seg">${btn('sub', 'macd', 'MACD')}${btn('sub', 'kdj', 'KDJ')}</div><div class="mk-seg">${btn('range', 60, '60')}${btn('range', 120, '120')}${btn('range', 250, '250')}</div></div>
<div class="mk-body"><p class="mk-empty">正在加载 K 线…</p></div></section>`;
}

export function quoteLine(d) {
  const q = d?.quote || {};
  if (!q.price && !d?.name) return '';
  return `<div class="mk-qline"><b class="mk-qname">${escape(d.name || q.name || d.code)}</b><small>${escape(d.code || q.code || '')}</small><b class="mk-qprice mk-${tone(q.pct)}">${num(q.price)}</b><span class="mk-${tone(q.pct)}">${q.change != null ? (q.change > 0 ? '+' : '') + num(q.change) : ''} ${pct(q.pct)}</span>
<span class="mk-qkv">开 <b>${num(q.open)}</b></span><span class="mk-qkv">高 <b>${num(q.high)}</b></span><span class="mk-qkv">低 <b>${num(q.low)}</b></span><span class="mk-qkv">昨收 <b>${num(q.preClose)}</b></span><span class="mk-qkv">成交额 <b>${bigNum(q.amount)}</b></span>${q.turnover != null ? `<span class="mk-qkv">换手 <b>${num(q.turnover)}%</b></span>` : ''}</div>`;
}

const prefs = new Map(), kcache = new Map();
/** Fill every unbound .mk-box: fetch through call({action: 'kline', code, period}), cache 15 s (intraday) / 60 s. */
export function mountKlineBoxes(root, call, {now = Date.now} = {}) {
  for (const box of root.querySelectorAll('.mk-box[data-mk-code]')) {
    if (box.dataset.bound) continue;
    box.dataset.bound = '1';
    const code = box.dataset.mkCode, p = prefs.get(code) || {period: 'day', sub: 'macd', range: 120};
    let marks = []; try { marks = JSON.parse(box.dataset.mkMarks || '[]'); } catch {}
    const paint = async () => {
      for (const b of box.querySelectorAll('[data-mk]')) { const [k, v] = b.dataset.mk.split(':'); b.classList.toggle('chosen', String(p[k]) === v); b.disabled = p.period === 'intraday' && k !== 'period'; }
      const key = code + '|' + p.period, hit = kcache.get(key), body = box.querySelector('.mk-body');
      let d = hit && now() - hit.at < (p.period === 'intraday' ? 15e3 : 60e3) ? hit.data : null;
      if (!d) {
        if (body) body.innerHTML = '<p class="mk-empty">正在加载…</p>';
        try { const out = await call({action: 'kline', code, period: p.period}); d = out?.result ?? out; kcache.set(key, {at: now(), data: d}); if (kcache.size > 60) kcache.delete(kcache.keys().next().value); }
        catch (e) { if (body) body.innerHTML = `<p class="task-error">${escape(e?.message || e)}</p>`; return; }
      }
      if (!box.isConnected) return;
      const ql = box.querySelector('.mk-quote'); if (ql) ql.innerHTML = quoteLine(d);
      const t = root.querySelector?.('#mkStockTitle'); if (t && d?.name) t.textContent = `${d.name} ${d.code}`;
      if (body) body.innerHTML = p.period === 'intraday' ? trendSvg(d.points, d.preClose) : klineSvg(d.bars, {sub: p.sub, last: p.range, marks: p.period === 'day' ? marks : [], h: box.classList.contains('big') ? 520 : 440});
    };
    box.addEventListener('click', e => { const b = e.target.closest('[data-mk]'); if (!b || b.disabled) return; const [k, v] = b.dataset.mk.split(':'); p[k] = k === 'range' ? Number(v) : v; prefs.set(code, p); paint(); });
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
  return list.length ? `<div class="mk-sector-list">${list.map(q => stockBtn(q, `<small class="mk-amt">${bigNum(q.amount)}</small>`)).join('')}</div>` : '<p class="qk-empty">没有成分股数据</p>';
}

/** Daily-chart buy / sell marks from the strategy's backtest operations (加仓 / 买入 = buy, 减仓 / 卖出 = sell). */
export const opsMarks = ops => (ops || []).filter(o => o?.date && /加仓|买|减仓|卖/.test(String(o.action || ''))).slice(-80).map(o => ({date: String(o.date).slice(0, 10), type: /加仓|买/.test(o.action) ? 'buy' : 'sell', text: `${o.action}${o.price != null ? ' ' + o.price : ''}${o.reason ? ' · ' + o.reason : ''}`}));
