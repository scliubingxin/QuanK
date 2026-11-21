// [q1] Private quant engine helpers shared by main, renderer and tests. Pure: no Node / DOM APIs.
// QuanK only knows a generic contract. Everything specific to a strategy project (entry script, packages, endpoints,
// response fields, config keys, files to skip) is described by wb-engine.json inside that private project.
export const ADAPTER_FILE = 'wb-engine.json';
export const ACTIONS = {
  STRONG_BUY: ['强烈买入', 'buy'], BUY: ['买入', 'buy'], HOLD: ['持有', 'hold'], SELL: ['卖出', 'sell'], STRONG_SELL: ['急跌风控', 'sell'],
};
export const actionLabel = (a, text = '') => text || ACTIONS[a]?.[0] || a || '—';
export const actionTone = a => ACTIONS[a]?.[1] || 'hold';
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const arr = v => Array.isArray(v) ? v : [];

/** '600438' / 'sh600438' / 'SZ000001' -> '600438'. */
export function normalizeCode(value) {
  const m = /^(?:sh|sz|bj)?\s*(\d{6})$/i.exec(String(value ?? '').trim());
  if (!m) throw new Error('股票代码需要 6 位数字，例如 600519');
  return m[1];
}

/** Dotted path lookup: pick({a: {b: 1}}, 'a.b') -> 1. */
export const pick = (o, p) => String(p || '').split('.').filter(Boolean).reduce((x, k) => x == null ? undefined : x[k], o);
/** '{a.b}' placeholders; enc is applied to substituted values (URL paths). */
export const fill = (t, vars, enc = x => x) => String(t ?? '').replace(/\{([\w.]+)\}/g, (_, k) => { const v = pick(vars, k); return v == null ? '' : enc(String(v)); });
/** Deep fill for JSON bodies / config: a string that is exactly one placeholder keeps the value's type. */
export function fillDeep(x, vars) {
  if (typeof x === 'string') { const m = /^\{([\w.]+)\}$/.exec(x); return m ? (pick(vars, m[1]) ?? '') : fill(x, vars); }
  if (Array.isArray(x)) return x.map(v => fillDeep(v, vars));
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, fillDeep(v, vars)]));
  return x;
}

const pathOk = p => typeof p === 'string' && p.startsWith('/') && !p.includes('..') && !p.includes('://');
/** Validate a wb-engine.json object. Throws a Chinese message naming the missing / invalid key. */
export function normalizeAdapter(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error(`${ADAPTER_FILE} 需要是 JSON 对象`);
  const need = (ok, key) => { if (!ok) throw new Error(`${ADAPTER_FILE} 缺少或无效：${key}`); };
  need(typeof a.engine?.entry === 'string' && /^[\w.-]+\.py$/.test(a.engine.entry), 'engine.entry（项目根目录下的 .py 文件）');
  need(pathOk(a.auth?.path), 'auth.path');
  need(a.endpoints && typeof a.endpoints === 'object', 'endpoints');
  for (const k of ['pool', 'signal']) need(a.endpoints[k], `endpoints.${k}`);
  for (const [k, e] of Object.entries(a.endpoints)) need(pathOk(typeof e === 'string' ? e : e?.path), `endpoints.${k}`);
  need(a.fields && typeof a.fields === 'object', 'fields');
  if (a.engine.health !== undefined) need(pathOk(a.engine.health), 'engine.health');
  if (a.engine.requires !== undefined) need(Array.isArray(a.engine.requires) && a.engine.requires.every(m => /^[A-Za-z_][\w.]*$/.test(m)), 'engine.requires');
  if (a.config?.file !== undefined) need(/^[\w.-]+\.json$/.test(a.config.file), 'config.file');
  return a;
}

/** Files that never leave the source project: VCS / caches, logs, databases, anything named like a secret.
 *  `extra` holds the project's own exclusions (regex strings from wb-engine.json). rel is a POSIX path. */
const BASE_EXCLUDE = [/(^|\/)(\.git|__pycache__|\.venv|venv|node_modules|\.idea|\.vscode)(\/|$)/, /\.pyc$/, /\.log$/, /(^|\/)\.DS_Store$/,
  /(^|\/)\.env(\.|$)/, /\.(db|sqlite|sqlite3)(-wal|-shm|-journal)?$/i, /(^|\/)[^/]*secret[^/]*$/i];
export function syncIncluded(rel, extra = []) {
  const r = String(rel).replace(/\\/g, '/');
  if (r === ADAPTER_FILE) return true;
  if (BASE_EXCLUDE.some(x => x.test(r))) return false;
  for (const s of extra) { let re; try { re = s instanceof RegExp ? s : new RegExp(s); } catch { continue; } if (re.test(r)) return false; }
  return true;
}

const lines = a => arr(a).map(x => clip(typeof x === 'string' ? x : x?.text ?? x?.desc ?? '', 200)).filter(Boolean);
/** Engine response -> generic, render-ready summary using the adapter's field map. Every field is optional. */
export function summarize(adapter, code, raw = {}, quote = null) {
  const F = adapter?.fields || {}, g = p => p ? pick(raw, p) : undefined, q = p => p && quote ? pick(quote, p) : undefined;
  const fac = F.factors || {}, bt = F.backtest || {};
  return {
    code, name: clip(q(F.quoteName) || g(F.name) || '', 30), date: clip(g(F.date), 20),
    price: num(g(F.price)) ?? num(q(F.quotePrice)), changePct: num(q(F.quoteChange)) ?? num(g(F.changePct)),
    score: num(g(F.score)), scoreRaw: num(g(F.scoreRaw)), action: clip(g(F.action), 20) || 'HOLD', actionText: clip(g(F.actionText), 30),
    multiplier: num(g(F.multiplier)), pause: !!g(F.pause), detail: clip(g(F.detail), 600), reasons: lines(g(F.reasons)).slice(0, 8),
    factors: arr(g(fac.path)).slice(0, 20).map(b => ({name: clip(pick(b, fac.name || 'name'), 30), score: num(pick(b, fac.score || 'score')), max: num(pick(b, fac.max || 'max')), reason: clip(pick(b, fac.reason || 'reason'), 160)})),
    gates: lines(g(F.gates)).slice(0, 6), gateCap: g(F.gateApplied) === false ? null : num(g(F.gateCap)),
    advice: arr(F.advice).map(p => clip(g(p), 300)).filter(Boolean).join(' ｜ '),
    indicators: arr(F.indicators).map(x => ({name: clip(x?.[0], 20), value: num(g(x?.[1]))})).filter(x => x.name && x.value !== null),
    probPct: num(g(F.probPct)), model: clip(g(F.model), 20),
    backtest: Object.fromEntries(['smartPct', 'blindPct', 'excess', 'winRate', 'trades', 'maxDrawdown'].map(k => [k, num(g(bt[k]))])),
    plan: clip(g(F.plan), 30),
  };
}

/** Grids (header row + data) for the chart frame: price / score series and the two backtest curves. */
export function chartGrids(adapter, raw = {}) {
  const F = adapter?.fields || {}, S = F.series || {}, C = F.curves || {}, O = F.ops || {}, L = adapter?.labels || {};
  const at = (o, k, d) => pick(o, k || d);
  const sig = arr(pick(raw, S.path)).filter(s => s && at(s, S.date, 'date')).slice(-400);
  const day = s => String(at(s, S.date, 'date')).slice(0, 10);
  const head = ['日期', clip(L.price, 20) || '价格', clip(L.score, 20) || '评分'];
  const price = [head, ...sig.map(s => [day(s), num(at(s, S.price, 'price')), num(at(s, S.score, 'score'))])];
  const a = arr(pick(raw, C.a?.path)), b = arr(pick(raw, C.b?.path));
  const cd = x => String(at(x, C.date, 'date')).slice(0, 10), bmap = new Map(b.map(x => [cd(x), x]));
  const chead = ['日期', clip(C.a?.label, 20) || '策略', clip(C.b?.label, 20) || '基准', clip(C.costLabel, 20) || '投入'];
  const curve = [chead, ...a.slice(-800).map(x => { const k = cd(x), y = bmap.get(k); return [k, num(at(x, C.value, 'value')), num(y ? at(y, C.value, 'value') : null), num(at(x, C.cost, 'cost'))]; })];
  const ops = arr(pick(raw, O.path)).slice(-60).reverse().map(o => ({date: clip(at(o, O.date, 'date'), 10), action: clip(at(o, O.action, 'action'), 12), price: num(at(o, O.price, 'price')),
    shares: num(at(o, O.shares, 'shares')), amount: num(at(o, O.amount, 'amount')), score: num(at(o, O.score, 'score')), reason: clip(at(o, O.reason, 'reason'), 120)}));
  const marks = sig.filter(s => /buy|sell|买|卖/i.test(String(at(s, S.type, 'type') || ''))).slice(-80).map(s => ({date: day(s), type: String(at(s, S.type, 'type')), price: num(at(s, S.price, 'price'))}));
  return {price: sig.length ? price : null, curve: a.length ? curve : null, ops, marks, labels: {price: head[1], score: head[2], a: chead[1], b: chead[2], cost: chead[3]}};
}

/** Mainland trading session (CST): weekdays 09:30–11:30 and 13:00–15:00. Holidays are not known here. */
export function isTradingTime(ms = Date.now()) {
  const d = new Date(ms + 8 * 3600e3), day = d.getUTCDay(), m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return day >= 1 && day <= 5 && ((m >= 570 && m <= 690) || (m >= 780 && m <= 900));
}

/** Requests that need the quant tools even with the composer's tool switch off (only when an engine is configured). */
// [q3] Watching the pool: settings, the CST clock and a one-line description. Pure.
export const WATCH_INTERVALS = [5, 10, 15, 30, 60];
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const OPEN = 570; // 09:30
export function normalizeWatch(w) {
  const o = w && typeof w === 'object' ? w : {};
  const interval = WATCH_INTERVALS.includes(Number(o.interval)) ? Number(o.interval) : 15;
  let time = HM.test(String(o.premarketTime || '')) ? String(o.premarketTime) : '09:15';
  let [h, m] = time.split(':').map(Number);
  if (h * 60 + m >= OPEN || h * 60 + m < 360) { time = '09:15'; h = 9; m = 15; }
  return {enabled: o.enabled === true, interval, notify: o.notify !== false, premarket: o.premarket !== false, premarketTime: time, premarketMinutes: h * 60 + m};
}
/** Validate a settings change; throws a Chinese message. Returns only the stored keys. */
export function parseWatch(p = {}) {
  const out = {};
  if (p.enabled !== undefined) out.enabled = p.enabled === true;
  if (p.notify !== undefined) out.notify = p.notify !== false;
  if (p.premarket !== undefined) out.premarket = p.premarket !== false;
  if (p.interval !== undefined) { if (!WATCH_INTERVALS.includes(Number(p.interval))) throw new Error(`检查频率只能是 ${WATCH_INTERVALS.join(' / ')} 分钟`); out.interval = Number(p.interval); }
  if (p.premarketTime !== undefined) {
    const t = String(p.premarketTime), ok = HM.exec(t);
    if (!ok || +ok[1] * 60 + +ok[2] >= OPEN || +ok[1] < 6) throw new Error('盘前简报时间需要在 06:00–09:29 之间');
    out.premarketTime = t;
  }
  return out;
}
export function describeWatch(w) {
  const x = normalizeWatch(w);
  if (!x.enabled) return '盯盘提醒未开启';
  return `交易时段每 ${x.interval} 分钟检查${x.premarket ? ` · 工作日 ${x.premarketTime} 盘前简报` : ''}${x.notify ? ' · 系统通知' : ''}`;
}
/** Wall clock in China Standard Time: {day:'YYYY-MM-DD', weekday, minutes since midnight}. */
export function cstClock(ms = Date.now()) {
  const d = new Date(ms + 8 * 3600e3), wd = d.getUTCDay();
  return {day: d.toISOString().slice(0, 10), weekday: wd >= 1 && wd <= 5, minutes: d.getUTCHours() * 60 + d.getUTCMinutes()};
}

// [q4] Holdings and investment plan. Field paths come from the adapter's `holdings` / `planFields` / `planOptions`.
const round2 = v => Math.round(v * 100) / 100;
export const lotSize = adapter => Number.isInteger(adapter?.holdings?.lot) && adapter.holdings.lot > 0 ? adapter.holdings.lot : 1;
export const engineFeatures = ad => ({holdings: !!ad?.endpoints?.position, record: !!ad?.endpoints?.positionRecord, plan: !!ad?.endpoints?.plan, planSet: !!ad?.endpoints?.planSet, lot: lotSize(ad)});
export function summarizeHolding(adapter, code, raw = {}, price = null) {
  const H = adapter?.holdings || {}, L = H.log || {}, sides = H.sides || {buy: 'B', sell: 'S'}, g = p => p ? pick(raw, p) : undefined;
  const shares = num(g(H.shares)) ?? 0, cost = num(g(H.cost)), px = num(price);
  const value = px !== null ? round2(shares * px) : null, pnl = px !== null && cost !== null && shares ? round2((px - cost) * shares) : null;
  const sideOf = v => String(v ?? '').toUpperCase() === String(sides.sell ?? 'S').toUpperCase() ? 'sell' : 'buy';
  const at = (e, k, d) => pick(e, L[k] || d);
  const log = arr(g(L.path)).slice(0, 30).map(e => ({date: clip(at(e, 'date', 'date'), 10), time: clip(at(e, 'time', 'time'), 8), side: sideOf(at(e, 'side', 'side')),
    price: num(at(e, 'price', 'price')), shares: num(at(e, 'shares', 'shares')), amount: num(at(e, 'amount', 'amount')), note: clip(at(e, 'note', 'note'), 60)}));
  return {code, shares, cost, cash: num(g(H.cash)), trades: num(g(H.trades)) ?? log.length, fee: num(g(H.fee)), budget: num(g(H.budget)), price: px, value, pnl,
    pnlPct: pnl !== null && cost ? round2((px / cost - 1) * 100) : null, log};
}
export function holdingTotals(list) {
  const ok = arr(list).filter(h => h && !h.error && h.shares > 0);
  const all = k => ok.length && ok.every(h => h[k] !== null && h[k] !== undefined);
  const cost = ok.every(h => h.cost !== null) ? round2(ok.reduce((n, h) => n + h.cost * h.shares, 0)) : null;
  return {stocks: ok.length, value: all('value') ? round2(ok.reduce((n, h) => n + h.value, 0)) : null, pnl: all('pnl') ? round2(ok.reduce((n, h) => n + h.pnl, 0)) : null, cost};
}
/** Validate a recorded trade. `holding` (optional) blocks selling more than is held; `today` blocks future dates. */
export function parseTrade(adapter, p = {}, holding = null, today = '') {
  const code = normalizeCode(p.code), side = p.side === 'sell' ? 'sell' : p.side === 'buy' ? 'buy' : null;
  if (!side) throw new Error('请选择买入或卖出');
  const price = Number(p.price), shares = Number(p.shares), lot = lotSize(adapter);
  if (!(price > 0) || price > 1e6) throw new Error('成交价需要大于 0');
  if (!Number.isInteger(shares) || shares <= 0 || shares > 1e9) throw new Error('股数需要是正整数');
  if (shares % lot) throw new Error(`股数需要是 ${lot} 的整数倍`);
  if (side === 'sell' && holding && shares > (holding.shares || 0)) throw new Error(`卖出 ${shares} 股超过当前持仓 ${holding.shares || 0} 股`);
  const date = p.date ? String(p.date).trim() : today;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期格式需要是 YYYY-MM-DD');
  if (today && date && date > today) throw new Error('不能记录未来日期的成交');
  return {code, side, price: Math.round(price * 1000) / 1000, shares, date, note: clip(p.note, 60)};
}
export function summarizePlan(adapter, raw = {}) {
  const P = adapter?.planFields || {}, g = p => p ? pick(raw, p) : undefined;
  return {label: clip(g(P.label), 30), type: clip(g(P.type), 20), times: num(g(P.times)), maxMultiplier: num(g(P.maxMultiplier))};
}
export const planOptions = adapter => arr(adapter?.planOptions)
  .filter(o => o && /^[\w-]{1,20}$/.test(o.type) && Number.isInteger(o.min) && Number.isInteger(o.max) && o.min >= 1 && o.max >= o.min && o.max <= 100)
  .map(o => ({type: o.type, label: clip(o.label, 10) || o.type, min: o.min, max: o.max}));
export function parsePlan(options, p = {}) {
  const o = arr(options).find(x => x.type === p.type);
  if (!o) throw new Error(`定投周期只能是 ${arr(options).map(x => x.label).join(' / ') || '引擎支持的选项'}`);
  const times = Number(p.times);
  if (!Number.isInteger(times) || times < o.min || times > o.max) throw new Error(`${o.label}次数需要在 ${o.min}–${o.max} 之间`);
  return {type: o.type, times};
}

// [q5] Engine reports: analysis scripts the private engine ships, described in the adapter's `reports` list.
const REL = p => typeof p === 'string' && p.length > 0 && p.length < 200 && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.split(/[\\/]/).includes('..');
export function normalizeReports(list) {
  return arr(list).filter(r => r && /^[\w-]{1,30}$/.test(r.id) && /^[\w.-]+\.py$/.test(r.script) && REL(r.output) && (r.markdown === undefined || REL(r.markdown))
      && (r.args === undefined || (Array.isArray(r.args) && r.args.length <= 12 && r.args.every(a => typeof a === 'string' && a.length <= 100 && !/[\0\r\n]/.test(a)))))
    .slice(0, 10).map(r => ({id: r.id, title: clip(r.title, 30) || r.id, script: r.script, args: r.args || [], output: r.output, markdown: r.markdown, schedule: r.schedule === 'daily' ? 'daily' : 'manual', fields: r.fields && typeof r.fields === 'object' && !Array.isArray(r.fields) ? r.fields : {}}));
}
const fmtMetric = (v, f) => typeof v === 'number' && Number.isFinite(v) ? (f === 'pct' ? `${Math.round(v * 1000) / 10}%` : String(Math.round(v * 100) / 100)) : v == null || typeof v === 'object' ? null : clip(v, 30) || null;
export function summarizeReport(def, raw = {}) {
  const F = def?.fields || {}, I = F.items || {}, g = p => p ? pick(raw, p) : undefined;
  return {
    summary: clip(g(F.summary), 400),
    metrics: arr(F.metrics).slice(0, 12).map(m => ({label: clip(m?.[0], 20), value: fmtMetric(g(m?.[1]), m?.[2])})).filter(m => m.label && m.value !== null),
    warnings: arr(F.warnings).map(w => { const o = g(w?.path); return o == null || o === false ? '' : clip(typeof o === 'object' ? fill(w.text || '', o) : (w.text || String(o)), 240); }).filter(Boolean),
    items: arr(g(I.path)).slice(0, 10).map(x => ({title: clip(pick(x, I.title || 'title'), 160), detail: clip(pick(x, I.detail || 'detail'), 300), level: clip(pick(x, I.level || 'level'), 10)})).filter(x => x.title),
  };
}
export const reportDefsView = ad => normalizeReports(ad?.reports).map(({id, title, schedule}) => ({id, title, schedule}));
const HM2 = /^([01]\d|2[0-3]):([0-5]\d)$/;
export function normalizeReportAuto(a) {
  const o = a && typeof a === 'object' ? a : {};
  let t = HM2.test(String(o.time || '')) ? String(o.time) : '18:00';
  if (Number(t.slice(0, 2)) < 15) t = '18:00';
  const [h, m] = t.split(':').map(Number);
  return {enabled: o.enabled === true, time: t, minutes: h * 60 + m};
}
export function parseReportAuto(p = {}) {
  const out = {};
  if (p.enabled !== undefined) out.enabled = p.enabled === true;
  if (p.time !== undefined) {
    if (!HM2.test(String(p.time))) throw new Error('生成时间需要是 HH:mm');
    if (Number(String(p.time).slice(0, 2)) < 15) throw new Error('自动生成时间需要在收盘后（15:00 之后）');
    out.time = String(p.time);
  }
  return out;
}
export const describeReportAuto = a => { const x = normalizeReportAuto(a); return x.enabled ? `工作日 ${x.time} 自动生成` : '仅手动生成'; };

/** [fin2] Last n positive prices of the adapter's series, for sparklines. */
export function sparkSeries(adapter, raw = {}, n = 60) {
  const S = adapter?.fields?.series || {};
  if (!S.path) return [];
  const v = arr(pick(raw, S.path)).map(s => num(typeof s === 'object' && s ? pick(s, S.price || 'price') : null)).filter(x => x !== null && x > 0);
  return v.slice(-n).map(x => Math.round(x * 1000) / 1000);
}

export const QUANT_INTENT = /大盘|指数|上证|深证|创业板|沪深300|科创50|板块|涨停|跌停|涨幅榜|跌幅榜|领涨|(添加|加入|关注|加到|移出)[^，。,.!?！？\n]{1,14}|股票|股价|个股|行情|K\s?线|量化|信号|买点|卖点|回测|定投|持仓|仓位|研判|自选|股票池|日报|复盘|记录.{0,4}(买入|卖出|成交)|(?<![\d.])[036]\d{5}(?!\d)/i;
