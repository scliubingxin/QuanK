// [v0.52] 半自动委托 (pure, shared by main and renderer).
// Signals (BUY / STRONG_BUY / SELL / STRONG_SELL changes) and stop-loss breaches become *draft orders*: side, shares, limit
// price and amount, after a risk pre-check (order / daily caps, cash, position and industry caps). Nothing is ever sent
// to a broker from here: in paper mode drafts fill against live quotes into a paper ledger; in real mode the user
// confirms, QuankSight fills the broker page and the user presses the broker's own submit button.

export const num = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const r2 = v => Math.round(v * 100) / 100;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const isCode = c => /^\d{6}$/.test(String(c || ''));
export const cstDay = t => new Date(t + 8 * 3600e3).toISOString().slice(0, 10);
export const cstMinutes = t => { const d = new Date(t + 8 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
export const CLOSE_MINUTES = 15 * 60;

export const TRADE_DEFAULTS = {enabled: true, paused: false, mode: 'paper', fromSignals: true, fromStops: true, baseAmount: 5000, maxOrder: 20000, maxDaily: 50000, maxCount: 5,
  slippage: 0.3, maxDeviation: 1.5, sellPct: 50, paperCash: 100000};
const RANGES = {baseAmount: [100, 1e7, '每笔基准金额'], maxOrder: [100, 1e8, '单笔上限'], maxDaily: [100, 1e9, '每日成交额上限'], maxCount: [1, 50, '每日最多笔数'],
  slippage: [0, 5, '限价滑点'], maxDeviation: [0.1, 10, '限价偏离上限'], sellPct: [10, 100, '卖点卖出比例'], paperCash: [1000, 1e9, '模拟盘初始资金']};
export function normalizeTradeSettings(s) {
  const o = s && typeof s === 'object' ? s : {}, out = {};
  for (const k of ['enabled', 'paused', 'fromSignals', 'fromStops']) out[k] = typeof o[k] === 'boolean' ? o[k] : TRADE_DEFAULTS[k];
  out.mode = o.mode === 'real' ? 'real' : 'paper';
  for (const [k, [lo, hi]] of Object.entries(RANGES)) { const v = num(o[k]); out[k] = v !== null && v >= lo && v <= hi ? (k === 'maxCount' ? Math.round(v) : v) : TRADE_DEFAULTS[k]; }
  if (out.slippage > out.maxDeviation) out.slippage = out.maxDeviation;
  return out;
}
/** A settings change. Switching to real trading needs confirmReal === true (the UI shows a risk dialog). */
export function parseTradeSettings(input = {}, base = {}) {
  const out = normalizeTradeSettings(base);
  for (const k of ['enabled', 'paused', 'fromSignals', 'fromStops']) if (k in input) out[k] = input[k] === true || input[k] === 'on' || input[k] === 'true';
  if ('mode' in input) {
    const m = input.mode === 'real' ? 'real' : 'paper';
    if (m === 'real' && out.mode !== 'real' && input.confirmReal !== true) throw new Error('切换到真实下单需要先确认风险提示');
    out.mode = m;
  }
  for (const [k, [lo, hi, label]] of Object.entries(RANGES)) {
    if (!(k in input) || input[k] === '' || input[k] === null) continue;
    const v = num(String(input[k]).replace(/[,，%元]/g, ''));
    if (v === null || v < lo || v > hi) throw new Error(`${label}应在 ${lo}–${hi} 之间`);
    out[k] = k === 'maxCount' ? Math.round(v) : v;
  }
  if (out.slippage > out.maxDeviation) throw new Error(`限价滑点（${out.slippage}%）不能超过限价偏离上限（${out.maxDeviation}%）`);
  if (out.maxOrder > out.maxDaily) throw new Error('单笔上限不能超过每日成交额上限');
  return out;
}
export function describeTradeSettings(s) {
  const x = normalizeTradeSettings(s);
  if (!x.enabled) return '半自动委托未开启';
  return `${x.mode === 'real' ? '真实下单' : '模拟盘'}${x.paused ? ' · 已暂停' : ''} · 每笔 ${x.baseAmount} 元 × 倍率 · 单笔 ≤ ${x.maxOrder} · 每日 ≤ ${x.maxDaily} / ${x.maxCount} 笔 · 限价偏离 ≤ ${x.maxDeviation}%`;
}

// ---------- price ----------
export function limitPct(code, name = '') {
  const c = String(code || '');
  if (/ST/i.test(name)) return 5;
  if (/^(4|8|92)/.test(c)) return 30;
  return /^(30|68)/.test(c) ? 20 : 10;
}
export const minLot = code => /^68/.test(String(code)) ? 200 : 100;
/** Limit price: last price ± slippage, inside the day's price limits, at most maxDeviation away from the last price. */
export function limitPrice({side, price, preClose, code, name = '', slippage = 0.3, maxDeviation = 1.5}) {
  const p = num(price);
  if (!(p > 0)) throw new Error('没有现价，不能计算限价');
  const pc = num(preClose) > 0 ? num(preClose) : p, lim = limitPct(code, name) / 100;
  const up = r2(pc * (1 + lim)), down = r2(pc * (1 - lim));
  const s = Math.min(slippage, maxDeviation) / 100;
  let lp = side === 'buy' ? r2(p * (1 + s)) : r2(p * (1 - s));
  lp = Math.min(up, Math.max(down, lp));
  const atLimit = side === 'buy' ? p >= up - 0.001 : p <= down + 0.001;
  return {price: lp, up, down, atLimit, deviation: r2(Math.abs(lp / p - 1) * 100)};
}

// ---------- order drafts ----------
export const SIDE_TEXT = {buy: '买入', sell: '卖出'};
export const STATUS_TEXT = {draft: '待确认', open: '模拟挂单中', filling: '填单中', awaiting: '待你在券商页面提交', submitted: '已提交，待成交', filled: '已成交', partial: '部分成交',
  cancelled: '已撤销', expired: '已过期', blocked: '未通过风控', review: '待核对'};
export const ACTIVE = new Set(['draft', 'open', 'filling', 'awaiting', 'submitted']);
const BUY_ACTIONS = new Set(['BUY', 'STRONG_BUY']), SELL_ACTIONS = new Set(['SELL', 'STRONG_SELL']);
/** Usage of today's caps: buy amount committed and order count (anything not cancelled / expired / blocked). */
export function usage(orders = [], day) {
  const live = orders.filter(o => o.day === day && !['cancelled', 'expired', 'blocked'].includes(o.status));
  return {buyAmount: r2(live.filter(o => o.side === 'buy').reduce((n, o) => n + (o.status === 'filled' || o.status === 'partial' ? o.filledAmount ?? o.amount : o.amount), 0)), count: live.length};
}
/**
 * signal: {code, name, action, multiplier, reason, source: 'signal'|'stop'|'manual', side?, shares?, price?}
 * quote: {price, preClose, name}; holding: {shares, cost}; position: {value, weight, industry}; summary: {total, cash, byIndustry}
 * Returns {ok: true, order} or {ok: false, reason, order?: blocked draft}.
 */
export function draftOrder({signal, quote = {}, holding = null, settings, used = {buyAmount: 0, count: 0}, cash = null, summary = null, rules = null, industry = '', now = Date.now()}) {
  const S = normalizeTradeSettings(settings), code = String(signal?.code || '');
  if (!isCode(code)) return {ok: false, reason: '股票代码无效'};
  const action = String(signal.action || '').toUpperCase(), source = ['stop', 'manual'].includes(signal.source) ? signal.source : 'signal';
  const side = signal.side === 'buy' || signal.side === 'sell' ? signal.side : source === 'stop' ? 'sell' : BUY_ACTIONS.has(action) ? 'buy' : SELL_ACTIONS.has(action) ? 'sell' : null;
  if (!side) return {ok: false, reason: `信号「${action || '—'}」不生成委托单`};
  const name = clip(signal.name || quote.name || code, 20), price = num(quote.price);
  const base = {code, name, side, source, action, reason: clip(signal.reason, 160), multiplier: num(signal.multiplier), day: cstDay(now), created: now, expiresAt: Date.parse(cstDay(now) + 'T15:00:00+08:00')};
  const fail = reason => ({ok: false, reason, order: {...base, status: 'blocked', blockReason: reason, shares: 0, price: null, amount: 0}});
  if (!(price > 0)) return fail('没有取到现价');
  let lp;
  try { lp = limitPrice({side, price: num(signal.price) && source === 'manual' ? num(signal.price) : price, preClose: quote.preClose, code, name, slippage: S.slippage, maxDeviation: S.maxDeviation}); } catch (e) { return fail(e.message); }
  if (source === 'manual' && num(signal.price)) { const dev = Math.abs(num(signal.price) / price - 1) * 100; if (dev > S.maxDeviation) return fail(`限价 ${signal.price} 偏离现价 ${price} 超过 ${S.maxDeviation}%`); lp = {...lp, price: r2(num(signal.price))}; }
  if (side === 'buy' && lp.atLimit) return fail('已涨停，买不进');
  const lot = minLot(code), notes = [];
  if (used.count >= S.maxCount && source !== 'stop') return fail(`今天已经 ${used.count} 笔，达到每日最多 ${S.maxCount} 笔`);
  let shares;
  if (side === 'sell') {
    const have = Math.max(0, Math.floor(num(holding?.shares) || 0));
    if (!have) return fail('没有持仓，不能卖出');
    if (num(signal.shares)) shares = Math.min(have, Math.floor(num(signal.shares)));
    else if (source === 'stop' || action === 'STRONG_SELL') shares = have;
    else { shares = Math.floor(have * S.sellPct / 100 / 100) * 100; if (shares < 100) shares = Math.min(have, 100); }
    if (shares < have && have - shares < 100) shares = have; // never leave an odd lot that can only be sold on its own
    if (lp.atLimit) notes.push('已跌停，可能卖不出');
    if (source === 'stop') notes.push('止损卖出不受每日金额和笔数限制');
  } else {
    const mult = Math.min(5, Math.max(0, num(signal.multiplier) ?? 1));
    let amount = num(signal.shares) ? num(signal.shares) * lp.price : S.baseAmount * (mult || 1);
    const caps = [[S.maxOrder, `单笔上限 ${S.maxOrder} 元`], [S.maxDaily - (used.buyAmount || 0), `每日上限 ${S.maxDaily} 元（今天已用 ${r2(used.buyAmount || 0)}）`]];
    if (num(cash) !== null) caps.push([num(cash), `可用现金 ${r2(num(cash))} 元`]); else notes.push('没有设置账户现金，未核对余额');
    const pos = summary?.positions?.find(p => p.code === code), total = num(summary?.total) || 0;
    if (rules && total > 0 && rules.maxPosition < 100) caps.push([rules.maxPosition / 100 * total - (pos?.value || 0), `单股仓位上限 ${rules.maxPosition}%`]);
    const ind = industry || pos?.industry, g = ind && summary?.byIndustry?.find(x => x.industry === ind);
    if (rules && total > 0 && rules.maxIndustry < 100 && ind && ind !== '未分类') caps.push([rules.maxIndustry / 100 * total - (g?.value || 0), `${ind}行业仓位上限 ${rules.maxIndustry}%`]);
    for (const [cap, why] of caps) if (amount > cap) { amount = cap; notes.push(`按${why}缩减`); }
    shares = Math.floor(amount / lp.price / 100) * 100;
    if (shares < lot) return fail(notes.length ? `${notes.at(-1).replace(/^按|缩减$/g, '')}，剩余额度不够买 ${lot} 股` : `金额不够买 ${lot} 股`);
  }
  const amount = r2(shares * lp.price);
  return {ok: true, order: {...base, status: 'draft', shares, price: lp.price, last: price, amount, up: lp.up, down: lp.down, notes, key: `${code}:${side}:${base.day}`}};
}

// ---------- paper ledger ----------
export function normalizePaper(p, cash = TRADE_DEFAULTS.paperCash) {
  const o = p && typeof p === 'object' ? p : {};
  return {cash: num(o.cash) ?? cash, start: num(o.start) ?? cash, positions: o.positions && typeof o.positions === 'object' ? o.positions : {}, trades: Array.isArray(o.trades) ? o.trades.slice(0, 500) : []};
}
/** Would the paper order fill at this quote? buy when last ≤ limit, sell when last ≥ limit; fills at the better of the two. */
export function paperFill(order, quote) {
  const p = num(quote?.price);
  if (!(p > 0)) return null;
  if (order.side === 'buy' ? p <= order.price : p >= order.price) return {price: order.side === 'buy' ? Math.min(p, order.price) : Math.max(p, order.price), shares: order.shares};
  return null;
}
export function applyPaper(paper, order, fill, now = Date.now()) {
  const P = normalizePaper(paper), pos = P.positions[order.code] || {shares: 0, cost: 0}, amt = r2(fill.price * fill.shares);
  if (order.side === 'buy') {
    if (amt > P.cash + 0.005) throw new Error(`模拟盘现金不足：需要 ${amt}，可用 ${r2(P.cash)}`);
    const shares = pos.shares + fill.shares; P.positions[order.code] = {shares, cost: r2((pos.cost * pos.shares + amt) / shares), name: order.name}; P.cash = r2(P.cash - amt);
  } else {
    if (fill.shares > pos.shares) throw new Error(`模拟盘持有 ${pos.shares} 股，不能卖出 ${fill.shares} 股`);
    const left = pos.shares - fill.shares; if (left) P.positions[order.code] = {...pos, shares: left}; else delete P.positions[order.code]; P.cash = r2(P.cash + amt);
  }
  P.trades = [{time: now, code: order.code, name: order.name, side: order.side, price: fill.price, shares: fill.shares, amount: amt, orderId: order.id}, ...P.trades].slice(0, 500);
  return P;
}
export function paperSummary(paper, quotes = {}) {
  const P = normalizePaper(paper);
  const rows = Object.entries(P.positions).map(([code, x]) => { const price = num(quotes[code]?.price) ?? x.cost; return {code, name: x.name || code, shares: x.shares, cost: x.cost, price, value: r2(price * x.shares), pnl: r2((price - x.cost) * x.shares)}; });
  const value = r2(rows.reduce((n, r) => n + r.value, 0)), total = r2(P.cash + value);
  return {cash: P.cash, value, total, start: P.start, pnl: r2(total - P.start), pnlPct: P.start ? r2((total / P.start - 1) * 100) : null, positions: rows, trades: P.trades.length};
}

// ---------- broker page profile ----------
export const BROKER_PRESETS = [{id: 'cmschina', name: '招商证券（网页版）', url: 'https://t.cmschina.com/pch5/trade/ssologin/#/?t=jykstd'}];
export const BROKER_FIELDS = {code: '股票代码输入框', price: '委托价格输入框', shares: '委托数量输入框', submit: '「买入 / 卖出」提交按钮（只用来高亮，QuankSight 不会点它）'};
const SEL_OK = s => typeof s === 'string' && s.length > 0 && s.length <= 600 && !/[<{};]|javascript:|url\(/i.test(s); // [v0.53] '>' is the child combinator of the fallback path selectors
export function normalizeBroker(b) {
  const o = b && typeof b === 'object' ? b : {};
  let url = '';
  try { const u = new URL(String(o.url || '')); if (u.protocol === 'https:' && !u.username && !u.password) url = u.href; } catch {}
  const side = x => Object.fromEntries(Object.keys(BROKER_FIELDS).map(k => [k, SEL_OK(x?.[k]) ? x[k] : '']));
  return {id: clip(o.id, 30) || 'custom', name: clip(o.name, 30) || '券商网页版', url, buy: side(o.buy), sell: side(o.sell), orders: SEL_OK(o.orders) ? o.orders : '', buyUrl: o.buyUrl && /^https:/.test(o.buyUrl) ? clip(o.buyUrl, 600) : '', sellUrl: o.sellUrl && /^https:/.test(o.sellUrl) ? clip(o.sellUrl, 600) : ''};
}
export const brokerReady = (b, side) => { const x = normalizeBroker(b); return !!x.url && !!x[side]?.code && !!x[side]?.price && !!x[side]?.shares; };

// ---------- scripts injected into the broker page ----------
// The fill script only sets input values (native setter + input / change events) and outlines the submit button.
// It contains no click(), submit(), requestSubmit() or synthetic mouse / keyboard events: QuankSight cannot place an order.
export function fillScript({fields, values}) {
  return `(() => {
  const F = ${JSON.stringify(fields)}, V = ${JSON.stringify(values)}, out = {set: {}, read: {}, missing: [], submitFound: false};
  const q = s => { try { return s ? document.querySelector(s) : null; } catch { return null; } };
  for (const k of ['code', 'price', 'shares']) {
    const el = q(F[k]);
    if (!el || !('value' in el)) { out.missing.push(k); continue; }
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    el.focus();
    if (setter) setter.call(el, String(V[k])); else el.value = String(V[k]);
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
    el.blur();
    out.set[k] = String(V[k]);
  }
  for (const k of ['code', 'price', 'shares']) { const el = q(F[k]); if (el && 'value' in el) out.read[k] = String(el.value); }
  const btn = q(F.submit);
  if (btn) {
    out.submitFound = true;
    btn.style.outline = '3px solid #e5484d'; btn.style.outlineOffset = '3px'; btn.style.boxShadow = '0 0 0 8px rgba(229,72,77,.18)';
    btn.scrollIntoView?.({block: 'center'});
    let tip = document.getElementById('__qk_tip');
    if (!tip) { tip = document.createElement('div'); tip.id = '__qk_tip'; document.body.appendChild(tip); }
    tip.textContent = 'QuankSight 已填好委托：请核对代码、价格、数量，确认无误后由你自己点击红框里的按钮提交';
    tip.setAttribute('style', 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483647;background:#14213d;color:#fff;padding:10px 16px;border-radius:12px;font:600 14px -apple-system,PingFang SC,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);pointer-events:none');
  }
  return out;
})()`;
}
/** Calibration: the user clicks each field in turn; clicks are captured (the page never receives them) and turned into selectors. */
export function calibrateScript(steps) {
  return `new Promise(resolve => {
  const STEPS = ${JSON.stringify(steps)}, result = {}; let i = 0;
  const bar = document.createElement('div');
  bar.setAttribute('style', 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483647;background:#2f62f5;color:#fff;padding:10px 16px;border-radius:12px;font:600 14px -apple-system,PingFang SC,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25)');
  document.body.appendChild(bar);
  const show = () => { bar.textContent = 'QuankSight 标注（' + (i + 1) + '/' + STEPS.length + '）：请点击「' + STEPS[i][1] + '」  · 按 Esc 取消'; };
  const esc = s => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^\\w-]/g, '\\\\$&');
  const sel = el => {
    if (el.id && !/\\d{4,}/.test(el.id)) return '#' + esc(el.id);
    for (const a of ['name', 'placeholder', 'data-testid', 'aria-label']) { const v = el.getAttribute && el.getAttribute(a); if (v && v.length < 60) { const s = el.tagName.toLowerCase() + '[' + a + '="' + v.replace(/"/g, '\\\\"') + '"]'; try { if (document.querySelectorAll(s).length === 1) return s; } catch {} } }
    const parts = []; let e = el;
    while (e && e.nodeType === 1 && e !== document.body && parts.length < 8) { let k = 1, p = e; while ((p = p.previousElementSibling)) if (p.tagName === e.tagName) k++; parts.unshift(e.tagName.toLowerCase() + ':nth-of-type(' + k + ')'); e = e.parentElement; }
    return 'body > ' + parts.join(' > ');
  };
  const pick = el => { const t = STEPS[i][0]; if (t !== 'submit' && t !== 'orders') { const inp = el.closest('input,textarea') || el.querySelector?.('input,textarea'); if (inp) return inp; } if (t === 'submit') return el.closest('button,a,[role=button],input[type=button],input[type=submit]') || el; return el; };
  const block = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  const done = v => { for (const t of ['pointerdown', 'mousedown', 'mouseup', 'click', 'touchstart']) window.removeEventListener(t, onEv, true); window.removeEventListener('keydown', onKey, true); bar.remove(); resolve(v); };
  const onEv = e => { block(e); if (e.type !== 'click') return; const el = pick(e.target); result[STEPS[i][0]] = sel(el); el.style.outline = '2px dashed #2f62f5'; i++; if (i >= STEPS.length) done({ok: true, fields: result}); else show(); };
  const onKey = e => { if (e.key === 'Escape') { block(e); done({ok: false, cancelled: true, fields: result}); } };
  for (const t of ['pointerdown', 'mousedown', 'mouseup', 'click', 'touchstart']) window.addEventListener(t, onEv, true);
  window.addEventListener('keydown', onKey, true);
  show();
})`;
}
/** Read rows of the 当日委托 / 成交 table that mention a code (text only). */
export function readRowsScript(selector, code) {
  return `(() => { let root = null; try { root = document.querySelector(${JSON.stringify(selector)}); } catch {} if (!root) return {found: false, rows: []};
  const rows = [...root.querySelectorAll('tr,[role=row],li,.row')].map(r => String(r.innerText ?? r.textContent ?? '').replace(/\\s+/g, ' ').trim()).filter(t => t.includes(${JSON.stringify(code)})).slice(0, 20);
  return {found: true, rows}; })()`;
}
/** Parse a broker row like "600438 通威股份 买入 11.15 3000 已成 3000" into hints (best effort; the user confirms). */
export function parseRow(text, order) {
  const t = String(text || ''), nums = [...t.matchAll(/(\d+(?:\.\d+)?)/g)].map(m => Number(m[1])).filter(n => n !== Number(order.code));
  const status = /已撤|撤单|废单/.test(t) ? 'cancelled' : /部成|部分成交/.test(t) ? 'partial' : /已成|全部成交|已成交/.test(t) ? 'filled' : /已报|未成|待成交/.test(t) ? 'submitted' : '';
  const price = nums.find(n => n > 0 && Math.abs(n - order.price) / order.price < 0.05) ?? null;
  const ints = nums.filter(n => Number.isInteger(n) && n >= 100 && n % 100 === 0);
  return {status, price, shares: ints.includes(order.shares) ? order.shares : ints[0] ?? null};
}
