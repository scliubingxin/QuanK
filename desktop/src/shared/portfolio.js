// [F4] 组合与风控 (pure, shared by main and renderer).
// M1 组合总览: engine holdings + manually entered holdings -> positions, weights, industry allocation, back-calculated value curve.
// M2 风控规则: stop-loss / take-profit / trailing stop, position and industry caps, portfolio drawdown, risk announcements.
//    Rules only raise reminders; QuankSight never places orders.
// M3 风险指标: volatility, max drawdown, beta vs CSI 300, correlation matrix, historical VaR / CVaR.
// M4 压力测试: scenario shocks (market x beta, industry, single stock, custom) and rebalance simulation (calculation only).
import { niceTicks } from './knowledge.js';

export const num = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const r2 = v => v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;
const r4 = v => v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 1e4) / 1e4;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const isCode = c => /^\d{6}$/.test(String(c || ''));
export const TRADING_DAYS = 244;
export const MANUAL_LIMIT = 50;
export const BENCH = {id: '1.000300', name: '沪深300'};
export const UNCLASSIFIED = '未分类';
const money = v => v === null || v === undefined ? '—' : Math.abs(v) >= 1e8 ? `${r2(v / 1e8)} 亿` : Math.abs(v) >= 1e4 ? `${r2(v / 1e4)} 万` : `${r2(v)}`;
const pctText = v => v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${r2(v)}%`;
export const fmt = {money, pct: pctText};

// ---------- holdings ----------
/** A manually entered holding (for positions not recorded in the engine). Throws a Chinese message. */
export function normalizeManual(p = {}) {
  const code = String(p.code ?? '').trim();
  if (!isCode(code)) throw new Error('股票代码应为 6 位数字');
  const shares = num(p.shares), cost = num(p.cost);
  if (shares === null || shares <= 0 || !Number.isInteger(shares) || shares > 1e9) throw new Error('持股数量应为正整数');
  if (cost === null || cost <= 0 || cost > 1e5) throw new Error('成本价应大于 0');
  const stop = p.stopPrice === '' || p.stopPrice === undefined || p.stopPrice === null ? null : num(p.stopPrice);
  if (stop !== null && (stop <= 0 || stop > 1e5)) throw new Error('止损价应大于 0');
  return {code, name: clip(p.name, 20), shares, cost: r4(cost), stopPrice: stop === null ? null : r4(stop), note: clip(p.note, 60)};
}

/** First level of the Eastmoney industry path ('电气设备-电源设备-太阳能' -> '电气设备'). */
export const industryOf = s => clip(String(s || '').split(/[-－—/]/)[0], 16) || UNCLASSIFIED;

/**
 * Engine holdings ({code: {shares, cost, price, …}}) + manual holdings -> positions. A manual entry replaces the engine
 * entry for the same code (the user typed it on purpose). quotes: {code: {price, pct, name}}; industries: {code: '行业'}.
 */
export function mergePositions({engine = {}, manual = [], pool = [], quotes = {}, industries = {}, stops = {}} = {}) {
  const names = new Map((pool || []).map(p => [p.code, p.name]));
  const raw = new Map();
  for (const [code, h] of Object.entries(engine || {})) if (isCode(code) && h && !h.error && num(h.shares) > 0 && num(h.cost) > 0) raw.set(code, {code, shares: num(h.shares), cost: num(h.cost), price: num(h.price), source: 'engine'});
  for (const m of manual || []) if (isCode(m?.code)) raw.set(m.code, {code: m.code, shares: num(m.shares), cost: num(m.cost), price: null, source: 'manual', name: m.name, stopPrice: num(m.stopPrice), note: m.note || ''});
  const out = [];
  for (const x of raw.values()) {
    const q = quotes[x.code] || {}, price = num(q.price) ?? x.price, pct = num(q.pct);
    const value = price !== null ? r2(x.shares * price) : null, costValue = r2(x.shares * x.cost);
    const pnl = value !== null ? r2(value - costValue) : null;
    const prevValue = value !== null && pct !== null && pct > -100 ? value / (1 + pct / 100) : null;
    out.push({code: x.code, name: clip(x.name || names.get(x.code) || q.name || '', 20) || x.code, shares: x.shares, cost: x.cost, price, value, costValue, pnl,
      pnlPct: pnl !== null && costValue ? r2(pnl / costValue * 100) : null, dayPct: pct, dayPnl: prevValue !== null ? r2(value - prevValue) : null,
      industry: industries[x.code] || UNCLASSIFIED, source: x.source, stopPrice: num(stops[x.code]?.stopPrice) ?? x.stopPrice ?? null, note: x.note || ''});
  }
  return out.sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.code.localeCompare(b.code));
}

/** Totals, weights (of stocks + cash), industry allocation and concentration. */
export function summarizePortfolio(positions = [], cash = 0) {
  const c = Math.max(0, num(cash) ?? 0), priced = positions.filter(p => p.value !== null);
  const invested = r2(priced.reduce((n, p) => n + p.value, 0)), cost = r2(priced.reduce((n, p) => n + p.costValue, 0));
  const total = r2(invested + c), pnl = r2(invested - cost), day = priced.filter(p => p.dayPnl !== null);
  const weight = v => total > 0 ? r2(v / total * 100) : null;
  const rows = positions.map(p => ({...p, weight: p.value !== null ? weight(p.value) : null}));
  const groups = new Map();
  for (const p of rows) if (p.value !== null) { const g = groups.get(p.industry) || {industry: p.industry, value: 0, codes: [], names: []}; g.value += p.value; g.codes.push(p.code); g.names.push(p.name); groups.set(p.industry, g); }
  const byIndustry = [...groups.values()].map(g => ({...g, value: r2(g.value), weight: weight(g.value)})).sort((a, b) => b.value - a.value);
  const ws = rows.filter(p => p.weight !== null && invested > 0).map(p => p.value / invested);
  const hhi = ws.reduce((n, w) => n + w * w, 0);
  return {stocks: positions.length, priced: priced.length, unpriced: positions.length - priced.length, invested, cost, pnl, pnlPct: cost ? r2(pnl / cost * 100) : null,
    cash: r2(c), total, cashPct: weight(c), stockPct: weight(invested), dayPnl: day.length ? r2(day.reduce((n, p) => n + p.dayPnl, 0)) : null,
    positions: rows, byIndustry, top: rows.find(p => p.weight !== null) || null, effective: hhi > 0 ? r2(1 / hhi) : null};
}

// ---------- series ----------
const closes = bars => (bars || []).filter(b => b && num(b.close) > 0 && b.date).map(b => ({date: String(b.date).slice(0, 10), close: Number(b.close)}));
/**
 * Value curve back-calculated with the CURRENT holdings (shares fixed, cash fixed) over the dates every priced holding has
 * data for. It shows how the present portfolio would have moved, not the realised history.
 */
export function navSeries(positions = [], barsMap = {}, cash = 0, {limit = 250} = {}) {
  const held = positions.filter(p => p.shares > 0 && closes(barsMap[p.code]).length >= 2);
  if (!held.length) return [];
  const maps = held.map(p => new Map(closes(barsMap[p.code]).map(b => [b.date, b.close])));
  const start = held.map(p => closes(barsMap[p.code])[0].date).sort().at(-1);
  const dates = [...new Set(held.flatMap(p => closes(barsMap[p.code]).map(b => b.date)))].filter(d => d >= start).sort();
  const last = held.map(() => null), out = [], c = Math.max(0, num(cash) ?? 0);
  for (const d of dates) {
    let v = c, ok = true;
    held.forEach((p, i) => { const x = maps[i].get(d); if (x !== undefined) last[i] = x; if (last[i] === null) ok = false; else v += p.shares * last[i]; });
    if (ok) out.push({date: d, value: r2(v)});
  }
  return out.slice(-limit);
}
export function returnsOf(series) {
  const s = (series || []).filter(x => num(x.value ?? x.close) > 0), out = [];
  for (let i = 1; i < s.length; i++) out.push({date: s[i].date, r: (s[i].value ?? s[i].close) / (s[i - 1].value ?? s[i - 1].close) - 1});
  return out;
}
const mean = a => a.length ? a.reduce((n, x) => n + x, 0) / a.length : 0;
const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((n, x) => n + (x - m) ** 2, 0) / (a.length - 1)); };
function pairUp(ra, rb) { const m = new Map(rb.map(x => [x.date, x.r])), a = [], b = []; for (const x of ra) if (m.has(x.date)) { a.push(x.r); b.push(m.get(x.date)); } return [a, b]; }
function covCorr(a, b) {
  if (a.length < 3) return {beta: null, corr: null};
  const ma = mean(a), mb = mean(b); let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < a.length; i++) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return {beta: vb ? cov / vb : null, corr: va && vb ? cov / Math.sqrt(va * vb) : null};
}
export function drawdown(series) {
  let peak = null, peakDate = '', mdd = 0, from = '', to = '', cur = 0;
  for (const x of series || []) {
    const v = num(x.value ?? x.close); if (!(v > 0)) continue;
    if (peak === null || v > peak) { peak = v; peakDate = x.date; }
    cur = (peak - v) / peak;
    if (cur > mdd) { mdd = cur; from = peakDate; to = x.date; }
  }
  return {max: r2(mdd * 100), from, to, current: r2(cur * 100), peak: r2(peak)};
}
/** Beta of a stock (or series) against the benchmark from daily closes. */
export function betaOf(bars, benchBars) {
  const [a, b] = pairUp(returnsOf(closes(bars)), returnsOf(closes(benchBars)));
  const {beta, corr} = covCorr(a, b);
  return {beta: r2(beta), corr: r2(corr), days: a.length};
}
/** Risk metrics of a value curve; null when fewer than 20 daily returns. */
export function riskMetrics(nav = [], benchBars = [], {level = 0.95} = {}) {
  const rs = returnsOf(nav);
  if (rs.length < 20) return null;
  const r = rs.map(x => x.r), sorted = [...r].sort((a, b) => a - b), k = Math.max(0, Math.floor((1 - level) * sorted.length) - 0);
  const q = sorted[Math.min(sorted.length - 1, k)], tail = sorted.filter(x => x <= q);
  const first = nav[0].value, last = nav.at(-1).value, years = rs.length / TRADING_DAYS;
  const annual = first > 0 && years > 0 ? (last / first) ** (1 / years) - 1 : null, vol = std(r) * Math.sqrt(TRADING_DAYS);
  const [a, b] = pairUp(rs, returnsOf(closes(benchBars)));
  const {beta, corr} = covCorr(a, b), dd = drawdown(nav);
  const benchRet = b.length ? b.reduce((n, x) => n * (1 + x), 1) - 1 : null, ret = last / first - 1;
  return {days: rs.length, from: nav[0].date, to: nav.at(-1).date, totalReturn: r2(ret * 100), annualReturn: r2(annual === null ? null : annual * 100), volatility: r2(vol * 100),
    maxDrawdown: dd.max, drawdownFrom: dd.from, drawdownTo: dd.to, currentDrawdown: dd.current, beta: r2(beta), benchCorr: r2(corr), benchReturn: r2(benchRet === null ? null : benchRet * 100),
    ratio: vol > 0 && annual !== null ? r2(annual / vol) : null, var95: r2(-q * 100), varAmount: r2(-q * last), cvar95: r2(-mean(tail) * 100), cvarAmount: r2(-mean(tail) * last),
    worstDay: r2(sorted[0] * 100), bestDay: r2(sorted.at(-1) * 100), value: last};
}
/** Pairwise correlation of daily returns over the last `days` common sessions. */
export function correlationMatrix(barsMap = {}, items = [], {days = 120} = {}) {
  const list = items.filter(x => closes(barsMap[x.code]).length > 21);
  const rets = list.map(x => returnsOf(closes(barsMap[x.code])).slice(-days));
  const m = list.map((_, i) => list.map((__, j) => { if (i === j) return 1; const [a, b] = pairUp(rets[i], rets[j]); return r2(covCorr(a, b).corr); }));
  const pairs = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (m[i][j] !== null) pairs.push({a: list[i].code, b: list[j].code, names: [list[i].name, list[j].name], corr: m[i][j]});
  pairs.sort((x, y) => y.corr - x.corr);
  return {codes: list.map(x => x.code), names: list.map(x => x.name), matrix: m, high: pairs.filter(p => p.corr >= 0.7), pairs, avg: pairs.length ? r2(mean(pairs.map(p => p.corr))) : null};
}

// ---------- M2 rules ----------
export const RULE_DEFAULTS = {enabled: true, notify: true, interval: 15, stopLoss: 8, takeProfit: null, trailing: null, maxPosition: 30, maxIndustry: 50, maxDrawdown: 10, notices: true};
const RULE_RANGE = {stopLoss: [1, 50, '止损线'], takeProfit: [1, 500, '止盈线'], trailing: [1, 50, '回撤止盈'], maxPosition: [5, 100, '单股仓位上限'], maxIndustry: [10, 100, '单行业仓位上限'], maxDrawdown: [1, 60, '组合回撤线']};
export const RULE_INTERVALS = [5, 15, 30, 60];
export const RULE_LABELS = {stopLoss: '止损', stopPrice: '止损价', nearStop: '接近止损', takeProfit: '止盈', trailing: '回撤止盈', position: '仓位超限', industry: '行业集中', drawdown: '组合回撤', nearDrawdown: '接近回撤线', notice: '公告风险'};
/** Stored rules -> complete rules (silently drops bad values). */
export function normalizeRules(r) {
  const o = r && typeof r === 'object' ? r : {}, out = {};
  for (const k of ['enabled', 'notify', 'notices']) out[k] = typeof o[k] === 'boolean' ? o[k] : RULE_DEFAULTS[k];
  out.interval = RULE_INTERVALS.includes(Number(o.interval)) ? Number(o.interval) : RULE_DEFAULTS.interval;
  for (const [k, [lo, hi]] of Object.entries(RULE_RANGE)) { const v = k in o ? (o[k] === null ? null : num(o[k])) : RULE_DEFAULTS[k]; out[k] = v === null ? null : v >= lo && v <= hi ? r2(v) : RULE_DEFAULTS[k]; }
  out.stops = {};
  for (const [c, s] of Object.entries(o.stops || {}).slice(0, 100)) { const p = num(s?.stopPrice); if (isCode(c) && p > 0) out.stops[c] = {stopPrice: r4(p)}; }
  return out;
}
/** A settings change from the form or chat; '' / null turns a line off. Throws a Chinese message. */
export function parseRules(input = {}, base = RULE_DEFAULTS) {
  const out = normalizeRules(base);
  for (const k of ['enabled', 'notify', 'notices']) if (k in input) out[k] = input[k] === true || input[k] === 'on' || input[k] === 'true';
  if ('interval' in input) { if (!RULE_INTERVALS.includes(Number(input.interval))) throw new Error('检查间隔可选 5 / 15 / 30 / 60 分钟'); out.interval = Number(input.interval); }
  for (const [k, [lo, hi, label]] of Object.entries(RULE_RANGE)) {
    if (!(k in input)) continue;
    const raw = input[k];
    if (raw === '' || raw === null || raw === false || raw === 'off') { if (k === 'maxPosition' || k === 'maxIndustry') out[k] = 100; else out[k] = null; continue; }
    const v = num(String(raw).replace(/%$/, ''));
    if (v === null || v < lo || v > hi) throw new Error(`${label}应在 ${lo}%–${hi}% 之间`);
    out[k] = r2(v);
  }
  if (input.stops && typeof input.stops === 'object') {
    for (const [c, s] of Object.entries(input.stops)) {
      if (!isCode(c)) throw new Error('股票代码应为 6 位数字');
      if (s === null || s?.stopPrice === '' || s?.stopPrice === null) { delete out.stops[c]; continue; }
      const p = num(s?.stopPrice); if (!(p > 0)) throw new Error('止损价应大于 0');
      out.stops[c] = {stopPrice: r4(p)};
    }
  }
  return out;
}
export function describeRules(r) {
  const x = normalizeRules(r);
  if (!x.enabled) return '风控提醒未开启';
  const parts = [x.stopLoss ? `亏损 ${x.stopLoss}% 止损` : '', x.takeProfit ? `盈利 ${x.takeProfit}% 止盈` : '', x.trailing ? `高点回落 ${x.trailing}% 提醒` : '',
    x.maxPosition < 100 ? `单股 ≤ ${x.maxPosition}%` : '', x.maxIndustry < 100 ? `单行业 ≤ ${x.maxIndustry}%` : '', x.maxDrawdown ? `组合回撤 ${x.maxDrawdown}%` : '', x.notices ? '风险公告' : ''].filter(Boolean);
  return `${parts.join(' · ') || '没有设置规则'} · 交易时段每 ${x.interval} 分钟检查${x.notify ? ' · 系统通知' : ''}`;
}
const LEVEL_ORDER = {high: 0, medium: 1, low: 2};
const RISK_HOLDER = /质押|减持|冻结|平仓/;
/**
 * Evaluate the rules. summary from summarizePortfolio; nav from navSeries; highs: {code: highest close since the position
 * was opened (or the last 60 sessions)}; notices: {code: [{id,title,date,type,label}]}; today 'YYYY-MM-DD'.
 * Returns breaches sorted by level, each with a stable key for de-duplication.
 */
export function checkRules({summary, rules, nav = [], highs = {}, notices = {}, today = ''} = {}) {
  const R = normalizeRules(rules), out = [], s = summary || summarizePortfolio([]);
  const add = (kind, level, x) => out.push({kind, level, label: RULE_LABELS[kind], ...x, key: `${kind}:${x.code || x.industry || 'pf'}`});
  for (const p of s.positions || []) {
    if (p.price === null) continue;
    const who = p.name && p.name !== p.code ? `${p.name}（${p.code}）` : p.code;
    if (p.stopPrice && p.price <= p.stopPrice) add('stopPrice', 'high', {code: p.code, name: p.name, title: `${who}跌破止损价 ${p.stopPrice}`, detail: `现价 ${p.price}，成本 ${p.cost}，浮动 ${pctText(p.pnlPct)}`, value: p.price, limit: p.stopPrice});
    else if (R.stopLoss && p.pnlPct !== null && p.pnlPct <= -R.stopLoss) add('stopLoss', 'high', {code: p.code, name: p.name, title: `${who}亏损 ${r2(-p.pnlPct)}%，触及止损线 -${R.stopLoss}%`, detail: `现价 ${p.price}，成本 ${p.cost}，浮亏 ${money(p.pnl)}`, value: p.pnlPct, limit: -R.stopLoss});
    else if (R.stopLoss && p.pnlPct !== null && p.pnlPct <= -R.stopLoss * 0.75) add('nearStop', 'low', {code: p.code, name: p.name, title: `${who}接近止损线：浮动 ${pctText(p.pnlPct)}，止损线 -${R.stopLoss}%`, detail: `止损价约 ${r2(p.cost * (1 - R.stopLoss / 100))}`, value: p.pnlPct, limit: -R.stopLoss});
    if (R.takeProfit && p.pnlPct !== null && p.pnlPct >= R.takeProfit) add('takeProfit', 'medium', {code: p.code, name: p.name, title: `${who}盈利 ${r2(p.pnlPct)}%，达到止盈线 ${R.takeProfit}%`, detail: `现价 ${p.price}，成本 ${p.cost}，浮盈 ${money(p.pnl)}`, value: p.pnlPct, limit: R.takeProfit});
    const hi = num(highs[p.code]);
    if (R.trailing && hi && hi > p.cost && p.price > p.cost && p.price < hi) { const fall = r2((hi - p.price) / hi * 100); if (fall >= R.trailing) add('trailing', 'medium', {code: p.code, name: p.name, title: `${who}从高点 ${hi} 回落 ${fall}%`, detail: `回撤止盈线 ${R.trailing}%，现价 ${p.price}`, value: fall, limit: R.trailing}); }
    if (R.maxPosition < 100 && p.weight !== null && p.weight > R.maxPosition) add('position', 'medium', {code: p.code, name: p.name, title: `${who}仓位 ${p.weight}%，超过上限 ${R.maxPosition}%`, detail: `市值 ${money(p.value)}，组合总资产 ${money(s.total)}`, value: p.weight, limit: R.maxPosition});
  }
  if (R.maxIndustry < 100 && (s.positions || []).length > 1) for (const g of s.byIndustry || []) if (g.industry !== UNCLASSIFIED && g.weight > R.maxIndustry) add('industry', 'medium', {industry: g.industry, title: `${g.industry}行业仓位 ${g.weight}%，超过上限 ${R.maxIndustry}%`, detail: g.names.join('、'), value: g.weight, limit: R.maxIndustry});
  if (R.maxDrawdown && nav.length > 5) {
    const dd = drawdown(nav);
    if (dd.current >= R.maxDrawdown) add('drawdown', 'high', {title: `组合市值较高点回撤 ${dd.current}%，触及回撤线 ${R.maxDrawdown}%`, detail: `高点 ${money(dd.peak)}，当前 ${money(nav.at(-1).value)}（按当前持仓回溯）`, value: dd.current, limit: R.maxDrawdown});
    else if (dd.current >= R.maxDrawdown * 0.75) add('nearDrawdown', 'low', {title: `组合回撤 ${dd.current}%，接近回撤线 ${R.maxDrawdown}%`, detail: `高点 ${money(dd.peak)}`, value: dd.current, limit: R.maxDrawdown});
  }
  if (R.notices) {
    const since = today ? new Date(Date.parse(today + 'T00:00:00Z') - 7 * 86400e3).toISOString().slice(0, 10) : '';
    for (const p of s.positions || []) for (const n of (notices[p.code] || []).slice(0, 30)) {
      if (since && n.date && n.date < since) continue;
      const risk = n.type === 'risk', holder = n.type === 'holder' && RISK_HOLDER.test(n.title || '');
      if (risk || holder) out.push({kind: 'notice', level: risk ? 'high' : 'medium', label: RULE_LABELS.notice, code: p.code, name: p.name, title: `${p.name && p.name !== p.code ? `${p.name}（${p.code}）` : p.code}${n.label || '公告'}：${clip(n.title, 60)}`, detail: n.date || '', noticeId: n.id, key: `notice:${n.id}`});
    }
  }
  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

// ---------- M4 stress & simulation ----------
/** Blume-adjusted beta (0.67 x raw + 0.33, pulled toward 1) for scenario shocks, limited to 0–3; missing beta = 1. */
export const adjustedBeta = b => b === null || b === undefined || !Number.isFinite(b) ? 1 : Math.min(3, Math.max(0, 0.67 * b + 0.33));
/** Preset scenarios for the current portfolio. */
export function presetScenarios(summary) {
  const out = [{id: 'm5', kind: 'market', pct: -5, title: '大盘下跌 5%'}, {id: 'm10', kind: 'market', pct: -10, title: '大盘下跌 10%'}, {id: 'm20', kind: 'market', pct: -20, title: '大盘下跌 20%'}];
  const g = (summary?.byIndustry || []).find(x => x.industry !== UNCLASSIFIED);
  if (g) out.push({id: 'ind', kind: 'industry', industry: g.industry, pct: -20, title: `${g.industry}板块下跌 20%`});
  const t = summary?.top;
  if (t) out.push({id: 'top', kind: 'stock', code: t.code, pct: -27, title: `第一大持仓${t.name}连续三个跌停（约 -27%）`});
  return out;
}
/** Normalise a scenario from the form or chat. Throws a Chinese message. */
export function normalizeScenario(s = {}) {
  const kind = ['market', 'industry', 'stock', 'custom'].includes(s.kind) ? s.kind : 'market';
  const pct = num(String(s.pct ?? '').replace(/%$/, ''));
  if (kind !== 'custom' && (pct === null || pct < -90 || pct > 50)) throw new Error('涨跌幅应在 -90% 到 +50% 之间');
  const out = {kind, pct: kind === 'custom' ? null : r2(pct)};
  if (kind === 'industry') { out.industry = clip(s.industry, 16); if (!out.industry) throw new Error('请填写行业'); }
  if (kind === 'stock') { out.code = String(s.code || '').trim(); if (!isCode(out.code)) throw new Error('股票代码应为 6 位数字'); }
  if (kind === 'custom') {
    out.shocks = {};
    for (const [c, v] of Object.entries(s.shocks || {})) { const x = num(String(v).replace(/%$/, '')); if (!isCode(c) || x === null || x < -90 || x > 50) throw new Error('自定义情景：每只股票的涨跌幅应在 -90% 到 +50% 之间'); out.shocks[c] = r2(x); }
    if (!Object.keys(out.shocks).length) throw new Error('自定义情景至少要有一只股票');
  }
  out.title = clip(s.title, 40) || (kind === 'market' ? `大盘${pct < 0 ? '下跌' : '上涨'} ${Math.abs(pct)}%` : kind === 'industry' ? `${out.industry}板块${pct < 0 ? '下跌' : '上涨'} ${Math.abs(pct)}%` : kind === 'stock' ? `${out.code} ${pct < 0 ? '下跌' : '上涨'} ${Math.abs(pct)}%` : '自定义情景');
  return out;
}
/** Apply one scenario: market shocks scale by each stock's beta (missing beta = 1); cash is unchanged. */
export function stressTest(summary, scenario, {betas = {}, rules = null} = {}) {
  const sc = normalizeScenario(scenario), R = normalizeRules(rules);
  const rows = (summary?.positions || []).filter(p => p.value !== null).map(p => {
    let shock = 0, basis = '';
    if (sc.kind === 'market') { const raw = num(betas[p.code]), b = adjustedBeta(raw); shock = sc.pct * b; basis = raw === null ? 'Beta 按 1' : `调整后 Beta ${r2(b)}`; }
    else if (sc.kind === 'industry') { if (p.industry === sc.industry) { shock = sc.pct; basis = '同行业'; } }
    else if (sc.kind === 'stock') { if (p.code === sc.code) { shock = sc.pct; basis = '指定股票'; } }
    else if (sc.shocks[p.code] !== undefined) { shock = sc.shocks[p.code]; basis = '自定义'; }
    shock = Math.max(-100, shock);
    const loss = r2(p.value * shock / 100), price = r2(p.price * (1 + shock / 100)), pnlPct = p.cost ? r2((price / p.cost - 1) * 100) : null;
    return {code: p.code, name: p.name, value: p.value, shock: r2(shock), basis, loss, after: r2(p.value + loss), price, pnlPct, stop: !!(shock < 0 && ((p.stopPrice && price <= p.stopPrice) || (R.stopLoss && pnlPct !== null && pnlPct <= -R.stopLoss)))};
  });
  const loss = r2(rows.reduce((n, x) => n + x.loss, 0)), total = summary?.total || 0;
  const worst = [...rows].sort((a, b) => a.loss - b.loss)[0] || null;
  return {scenario: sc, rows, loss, lossPct: total ? r2(loss / total * 100) : null, before: r2(total), after: r2(total + loss), worst: worst && worst.loss < 0 ? worst : null, stops: rows.filter(x => x.stop).map(x => x.name)};
}
/**
 * Rebalance simulation (no orders): changes [{code, delta (+buy / -sell shares), price?, name?}]. Selling more than held
 * throws; a new stock needs a price (from quotes). Cash moves by delta x price; a negative cash balance is reported.
 */
export function simulateRebalance(positions = [], cash = 0, changes = [], {quotes = {}, industries = {}} = {}) {
  if (!Array.isArray(changes) || !changes.length) throw new Error('请给出至少一笔调仓');
  const map = new Map(positions.map(p => [p.code, {...p}])); let c = Math.max(0, num(cash) ?? 0); const done = [];
  for (const ch of changes.slice(0, 20)) {
    const code = String(ch.code || '').trim(), delta = num(ch.delta);
    if (!isCode(code)) throw new Error('股票代码应为 6 位数字');
    if (delta === null || !Number.isInteger(delta) || delta === 0) throw new Error('调仓股数应为非零整数（正数买入，负数卖出）');
    const cur = map.get(code), price = num(ch.price) ?? cur?.price ?? num(quotes[code]?.price);
    if (price === null || price <= 0) throw new Error(`${code} 没有现价，请给出价格`);
    if (delta < 0 && (!cur || cur.shares + delta < 0)) throw new Error(`${cur?.name || code} 持有 ${cur?.shares || 0} 股，不能卖出 ${-delta} 股`);
    const p = cur || {code, name: clip(ch.name || quotes[code]?.name || code, 20), shares: 0, cost: price, costValue: 0, price, industry: industries[code] || UNCLASSIFIED, source: 'sim', stopPrice: null, dayPct: null, dayPnl: null};
    if (delta > 0) p.cost = r4((p.cost * p.shares + price * delta) / (p.shares + delta));
    p.shares += delta; p.price = price; p.value = r2(p.shares * price); p.costValue = r2(p.shares * p.cost); p.pnl = r2(p.value - p.costValue); p.pnlPct = p.costValue ? r2(p.pnl / p.costValue * 100) : null;
    c -= delta * price; done.push({code, name: p.name, delta, price, amount: r2(delta * price)});
    if (p.shares === 0) map.delete(code); else map.set(code, p);
  }
  const before = summarizePortfolio(positions, cash), after = summarizePortfolio([...map.values()], Math.max(0, c));
  return {changes: done, before, after, cash: r2(c), shortfall: c < 0 ? r2(-c) : 0};
}

// ---------- charts ----------
const W = 960;
/** Value curve normalised to 100 (with the benchmark) and a drawdown band underneath. */
export function navSvg(nav = [], benchBars = [], {w = W, h = 300, title = '组合市值（按当前持仓回溯，起点 = 100）'} = {}) {
  if (nav.length < 2) return '<p class="empty-note">行情数据不足，暂时画不出组合曲线。</p>';
  const base = nav[0].value, pts = nav.map(x => ({date: x.date, v: x.value / base * 100}));
  const bm = new Map(closes(benchBars).map(b => [b.date, b.close])), b0 = bm.get(nav[0].date);
  const bpts = b0 ? pts.map(p => bm.has(p.date) ? {date: p.date, v: bm.get(p.date) / b0 * 100} : null) : [];
  const vals = [...pts.map(p => p.v), ...bpts.filter(Boolean).map(p => p.v)], lo = Math.min(...vals), hi = Math.max(...vals);
  const ticks = niceTicks(lo, hi, 5), y0 = ticks[0], y1 = ticks.at(-1);
  const L = 56, R = 16, T = 30, band = 56, B = 26, ph = h - T - B - band - 10, pw = w - L - R;
  const X = i => L + (pts.length === 1 ? 0 : i / (pts.length - 1) * pw), Y = v => T + (1 - (v - y0) / ((y1 - y0) || 1)) * ph;
  const line = arr => arr.map((p, i) => p ? `${X(i).toFixed(1)},${Y(p.v).toFixed(1)}` : null).filter(Boolean).join(' ');
  let peak = 0; const dds = pts.map(p => { peak = Math.max(peak, p.v); return (peak - p.v) / peak * 100; }), ddMax = Math.max(1, ...dds);
  const dTop = T + ph + 10, D = v => dTop + v / ddMax * band;
  const area = `${L},${dTop} ${dds.map((d, i) => `${X(i).toFixed(1)},${D(d).toFixed(1)}`).join(' ')} ${X(pts.length - 1).toFixed(1)},${dTop}`;
  const grid = ticks.map(t => `<line x1="${L}" x2="${w - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="#eef1f6"/><text x="${L - 6}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#8a94ad">${r2(t)}</text>`).join('');
  const xl = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map(i => `<text x="${X(i).toFixed(1)}" y="${h - 8}" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}" font-size="11" fill="#8a94ad">${esc(pts[i].date)}</text>`).join('');
  const last = pts.at(-1).v, legend = `<g font-size="12"><rect x="${L}" y="8" width="14" height="4" rx="2" fill="#2f62f5"/><text x="${L + 20}" y="14" fill="#24324f">组合 ${r2(last - 100) >= 0 ? '+' : ''}${r2(last - 100)}%</text>${bpts.some(Boolean) ? `<rect x="${L + 130}" y="8" width="14" height="4" rx="2" fill="#94a3b8"/><text x="${L + 150}" y="14" fill="#24324f">${BENCH.name} ${(() => { const l = bpts.filter(Boolean).at(-1).v - 100; return `${l >= 0 ? '+' : ''}${r2(l)}%`; })()}</text>` : ''}<rect x="${L + 280}" y="6" width="14" height="8" rx="2" fill="#d9d2ff"/><text x="${L + 300}" y="14" fill="#24324f">回撤（最深 ${r2(Math.max(...dds))}%）</text></g>`;
  return `<svg class="pf-svg" viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Inter,-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" role="img" aria-label="${esc(title)}"><defs><linearGradient id="pfNavFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f62f5" stop-opacity=".16"/><stop offset="1" stop-color="#2f62f5" stop-opacity="0"/></linearGradient><linearGradient id="pfDdFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8c7cff" stop-opacity=".18"/><stop offset="1" stop-color="#8c7cff" stop-opacity=".55"/></linearGradient></defs><rect width="${w}" height="${h}" fill="#fff"/>${grid}<line x1="${L}" x2="${w - R}" y1="${Y(100).toFixed(1)}" y2="${Y(100).toFixed(1)}" stroke="#cbd5e1" stroke-dasharray="4 4"/>${bpts.some(Boolean) ? `<polyline points="${line(bpts)}" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linejoin="round"/>` : ''}<polygon points="${L},${(T + ph).toFixed(1)} ${line(pts)} ${X(pts.length - 1).toFixed(1)},${(T + ph).toFixed(1)}" fill="url(#pfNavFill)"/><polyline points="${line(pts)}" fill="none" stroke="#2f62f5" stroke-width="2.2" stroke-linejoin="round"/><polygon points="${area}" fill="url(#pfDdFill)"/><text x="${L - 6}" y="${dTop + 10}" text-anchor="end" font-size="11" fill="#8a94ad">回撤</text>${xl}${legend}</svg>`;
}
/** Horizontal weight bars (stocks or industries) with an optional cap line. */
export function allocationSvg(rows = [], {w = W, cap = null, title = '仓位分布'} = {}) {
  const list = rows.filter(r => r.weight !== null && r.weight !== undefined).slice(0, 12);
  if (!list.length) return '<p class="empty-note">还没有可计算市值的持仓。</p>';
  const L = w < 800 ? 96 : 150, R = 64, T = 12, rowH = 28, h = T + list.length * rowH + 22, pw = w - L - R, max = Math.max(cap || 0, ...list.map(r => r.weight), 10), X = v => L + v / max * pw;
  const bars = list.map((r, i) => { const y = T + i * rowH, over = cap && r.weight > cap; return `<text x="${L - 10}" y="${y + 16}" text-anchor="end" font-size="12.5" fill="#24324f">${esc(clip(r.label, 10))}</text><rect x="${L}" y="${y + 4}" width="${pw.toFixed(1)}" height="16" rx="8" fill="#f3f6fc"/><rect x="${L}" y="${y + 4}" width="${Math.max(2, X(r.weight) - L).toFixed(1)}" height="16" rx="8" fill="${over ? '#e5484d' : r.cash ? '#c3cbe0' : 'url(#pfBarFill)'}"/><text x="${(X(r.weight) + 8).toFixed(1)}" y="${y + 16}" font-size="12" font-weight="600" fill="${over ? '#c62828' : '#24324f'}">${r2(r.weight)}%</text>`; }).join('');
  const capLine = cap && cap < 100 ? `<line x1="${X(cap).toFixed(1)}" x2="${X(cap).toFixed(1)}" y1="${T}" y2="${h - 18}" stroke="#e5484d" stroke-width="1.2" stroke-dasharray="4 3"/><text x="${X(cap).toFixed(1)}" y="${h - 5}" text-anchor="middle" font-size="11" fill="#c62828">上限 ${cap}%</text>` : '';
  return `<svg class="pf-svg" viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Inter,-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" role="img" aria-label="${esc(title)}"><defs><linearGradient id="pfBarFill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f62f5"/><stop offset="1" stop-color="#8c7cff"/></linearGradient></defs><rect width="${w}" height="${h}" fill="#fff"/>${bars}${capLine}</svg>`;
}
export const allocationRows = (summary, by = 'stock') => [...(by === 'industry' ? (summary?.byIndustry || []).map(g => ({label: g.industry, weight: g.weight})) : (summary?.positions || []).map(p => ({label: p.name, weight: p.weight}))), ...(summary?.cash > 0 ? [{label: '现金', weight: summary.cashPct, cash: true}] : [])];

// ---------- report ----------
export function portfolioReport({summary, breaches = [], metrics = null, corr = null, stress = [], rules = null, date = ''} = {}) {
  const s = summary || summarizePortfolio([]), R = normalizeRules(rules);
  const sections = [{id: 'overview', title: '组合概况', chart: 'alloc', paragraphs: [`持有 ${s.stocks} 只股票，股票市值 ${money(s.invested)}，现金 ${money(s.cash)}，总资产 ${money(s.total)}；持仓成本 ${money(s.cost)}，浮动盈亏 ${money(s.pnl)}（${pctText(s.pnlPct)}）。股票仓位 ${s.stockPct ?? '—'}%，有效持股数 ${s.effective ?? '—'}。`],
    table: [['股票', '代码', '持股', '成本', '现价', '市值', '仓位', '浮动盈亏', '行业'], ...s.positions.map(p => [p.name, p.code, String(p.shares), String(p.cost), p.price === null ? '—' : String(p.price), money(p.value), p.weight === null ? '—' : p.weight + '%', pctText(p.pnlPct), p.industry])]}];
  if (s.byIndustry.length) sections.push({id: 'industry', title: '行业分布', table: [['行业', '市值', '仓位', '股票'], ...s.byIndustry.map(g => [g.industry, money(g.value), g.weight + '%', g.names.join('、')])]});
  sections.push({id: 'rules', title: '风控检查', paragraphs: [`规则：${describeRules(R)}。`], bullets: breaches.length ? breaches.map(b => `【${b.label}】${b.title}${b.detail ? `（${b.detail}）` : ''}`) : ['当前没有触发任何风控规则。']});
  if (metrics) sections.push({id: 'metrics', title: '风险指标', chart: 'nav', paragraphs: [`按当前持仓回溯 ${metrics.days} 个交易日（${metrics.from} 至 ${metrics.to}），对比${BENCH.name}。`], table: [['指标', '数值'], ['区间收益', pctText(metrics.totalReturn)], [`${BENCH.name}同期`, pctText(metrics.benchReturn)], ['年化波动率', metrics.volatility + '%'], ['最大回撤', `${metrics.maxDrawdown}%（${metrics.drawdownFrom} 至 ${metrics.drawdownTo}）`], ['当前回撤', metrics.currentDrawdown + '%'], ['Beta', metrics.beta ?? '—'], ['与大盘相关系数', metrics.benchCorr ?? '—'], ['单日 VaR（95%）', `${metrics.var95}%，约 ${money(metrics.varAmount)}`], ['单日 CVaR（95%）', `${metrics.cvar95}%，约 ${money(metrics.cvarAmount)}`], ['最差单日', pctText(metrics.worstDay)]]});
  if (corr?.high?.length) sections.push({id: 'corr', title: '高相关持仓', bullets: corr.high.slice(0, 10).map(p => `${p.names[0]} 与 ${p.names[1]}：相关系数 ${p.corr}`)});
  if (stress.length) sections.push({id: 'stress', title: '压力测试', table: [['情景', '组合损失', '占总资产', '拖累最大', '会触发止损'], ...stress.map(x => [x.scenario.title, money(x.loss), pctText(x.lossPct), x.worst ? `${x.worst.name} ${money(x.worst.loss)}` : '—', x.stops.join('、') || '—'])]});
  sections.push({id: 'note', title: '说明', bullets: ['组合曲线与风险指标按当前持仓数量回溯历史行情估算，不是实际交易记录。', '大盘情景按各股相对沪深300的调整后 Beta（0.67 × 实测 Beta + 0.33）传导；行业情景只影响同一行业的持仓。', 'QuankSight 只做提醒与计算，不会替你下单。']});
  return {kind: 'portfolio', title: `组合风控报告 · ${date}`, subtitle: date, date, sections, summary: `总资产 ${money(s.total)}，浮动盈亏 ${pctText(s.pnlPct)}，风控提醒 ${breaches.length} 条。`, gaps: []};
}
