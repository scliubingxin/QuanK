// [v0.53] 量化训练数据: every signal the engine computes is recorded once per stock per trading day (the latest of the
// day wins) with its score, multiplier, model probability and factor scores; after enough trading days pass, each record
// is labelled with the forward returns from the daily K line (1 / 5 / 10 / 20 days, 20-day max gain and drawdown) and
// whether a buy / sell call turned out right. The labelled set is exported as CSV / JSONL for retraining the strategy
// model (for example into the strategy project's quank_dataset/ folder). Everything stays on this Mac.
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const LIMIT = 20000, HORIZONS = [1, 5, 10, 20];
const BUY = new Set(['BUY', 'STRONG_BUY']), SELL = new Set(['SELL', 'STRONG_SELL']);
const num = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const r2 = v => v === null ? null : Math.round(v * 100) / 100;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const cstDay = t => new Date(t + 8 * 3600e3).toISOString().slice(0, 10);
const isCode = c => /^\d{6}$/.test(String(c || ''));

/** One dataset row from a quant summary (see summarize() in src/shared/quant.js). */
export function recordOf(code, s = {}, now = Date.now()) {
  if (!isCode(code) || !s || !s.action) return null;
  const date = /^\d{4}-\d{2}-\d{2}/.test(String(s.date || '')) ? String(s.date).slice(0, 10) : cstDay(now);
  const factors = {};
  for (const f of Array.isArray(s.factors) ? s.factors.slice(0, 24) : []) { const k = clip(f?.name, 16), v = num(f?.score); if (k && v !== null) factors[k] = v; }
  return {date, code, name: clip(s.name, 20), action: clip(s.action, 20), actionText: clip(s.actionText, 20), score: num(s.score), scoreRaw: num(s.scoreRaw), multiplier: num(s.multiplier),
    probPct: num(s.probPct), price: num(s.price), changePct: num(s.changePct), model: clip(s.model, 20), plan: clip(s.plan, 30), factors, at: now};
}
/** Forward returns from daily bars [{date, close, high, low}] (ascending). null while fewer bars than the horizon exist. */
export function labelOf(rec, bars = []) {
  const i = bars.findIndex(b => String(b.date).slice(0, 10) === rec.date);
  if (i < 0) return null;
  const base = num(bars[i].close) || num(rec.price);
  if (!(base > 0)) return null;
  const out = {};
  for (const h of HORIZONS) { const b = bars[i + h]; out['ret' + h] = b && num(b.close) ? r2((b.close / base - 1) * 100) : null; }
  const win = bars.slice(i + 1, i + 21);
  if (win.length >= 20) {
    out.maxUp20 = r2((Math.max(...win.map(b => num(b.high) ?? num(b.close))) / base - 1) * 100);
    out.maxDown20 = r2((Math.min(...win.map(b => num(b.low) ?? num(b.close))) / base - 1) * 100);
  }
  out.outcome = out.ret20 === null ? null : BUY.has(rec.action) ? (out.ret20 > 0 ? 'right' : 'wrong') : SELL.has(rec.action) ? (out.ret20 < 0 ? 'right' : 'wrong') : null;
  out.complete = out.ret20 !== null && out.maxUp20 !== undefined;
  return out;
}
export function datasetStats(rows = []) {
  const labelled = rows.filter(r => r.label?.complete), byAction = {};
  for (const r of labelled) {
    const a = r.action, o = (byAction[a] ??= {n: 0, right: 0, ret20: 0});
    o.n++; if (r.label.outcome === 'right') o.right++; o.ret20 += r.label.ret20 || 0;
  }
  const calls = labelled.filter(r => r.label.outcome);
  return {total: rows.length, labelled: labelled.length, pending: rows.length - labelled.length, stocks: new Set(rows.map(r => r.code)).size,
    first: rows.length ? rows.reduce((m, r) => r.date < m ? r.date : m, rows[0].date) : null, last: rows.length ? rows.reduce((m, r) => r.date > m ? r.date : m, rows[0].date) : null,
    hitRate: calls.length ? r2(calls.filter(r => r.label.outcome === 'right').length / calls.length * 100) : null,
    byAction: Object.fromEntries(Object.entries(byAction).map(([a, o]) => [a, {n: o.n, hitRate: BUY.has(a) || SELL.has(a) ? r2(o.right / o.n * 100) : null, avgRet20: r2(o.ret20 / o.n)}]))};
}
const CSV_HEAD = ['date', 'code', 'name', 'action', 'score', 'scoreRaw', 'multiplier', 'probPct', 'price', 'changePct', 'model', 'plan', 'ret1', 'ret5', 'ret10', 'ret20', 'maxUp20', 'maxDown20', 'outcome'];
const cell = v => { if (v === null || v === undefined) return ''; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(rows = [], {labelledOnly = false} = {}) {
  const list = labelledOnly ? rows.filter(r => r.label?.complete) : rows;
  const fkeys = [...new Set(list.flatMap(r => Object.keys(r.factors || {})))].slice(0, 30);
  const head = [...CSV_HEAD, ...fkeys.map(k => 'f_' + k)];
  return '\ufeff' + [head.join(','), ...list.map(r => [...CSV_HEAD.map(k => k in (r.label || {}) && !(k in r) ? r.label[k] : r[k]), ...fkeys.map(k => r.factors?.[k])].map(cell).join(','))].join('\n') + '\n';
}
export const toJsonl = (rows = [], {labelledOnly = false} = {}) => (labelledOnly ? rows.filter(r => r.label?.complete) : rows).map(r => JSON.stringify(r)).join('\n') + '\n';

export function createDatasetService({dir, market = null, quantSource = () => '', saveDialog = null, notify = () => {}, now = Date.now, log = () => {}} = {}) {
  const file = path.join(dir, 'dataset', 'signals.json');
  let rows = null, dirty = false, saving = null, lastLabel = 0, busy = false;
  async function load() {
    if (rows) return rows;
    try { const j = JSON.parse(await readFile(file, 'utf8')); rows = Array.isArray(j) ? j : []; } catch { rows = []; }
    return rows;
  }
  async function save() {
    if (!dirty) return;
    if (saving) return saving;
    saving = (async () => { dirty = false; await mkdir(path.dirname(file), {recursive: true}); const tmp = file + '.tmp'; await writeFile(tmp, JSON.stringify(rows)); await rename(tmp, file); })().finally(() => { saving = null; });
    return saving;
  }
  async function record(code, summary) {
    const rec = recordOf(code, summary, now());
    if (!rec) return null;
    await load();
    const i = rows.findIndex(r => r.code === rec.code && r.date === rec.date);
    if (i >= 0) rows[i] = {...rec, label: rows[i].label?.complete ? rows[i].label : undefined}; else rows.push(rec);
    if (rows.length > LIMIT) rows = rows.slice(rows.length - LIMIT);
    dirty = true; await save(); notify();
    return rec;
  }
  /** Label records whose 20 trading days have passed (at most `max` stocks per call, one K-line fetch per stock). */
  async function label({max = 12} = {}) {
    if (!market || busy) return {labelled: 0};
    busy = true;
    try {
      await load();
      const today = cstDay(now()), todo = rows.filter(r => !r.label?.complete && r.date < today);
      const codes = [...new Set(todo.map(r => r.code))].slice(0, max);
      let n = 0;
      for (const code of codes) {
        let bars = [];
        try { bars = (await market.handle({action: 'kline', code, period: 'day', count: 400}))?.bars || []; } catch { continue; }
        for (const r of todo.filter(x => x.code === code)) { const l = labelOf(r, bars); if (l) { r.label = {...l, at: now()}; n++; } }
      }
      lastLabel = now();
      if (n) { dirty = true; await save(); notify(); }
      return {labelled: n, stocks: codes.length};
    } finally { busy = false; }
  }
  function view() {
    const list = rows || [];
    return {stats: datasetStats(list), recent: list.slice(-12).reverse().map(({factors, ...r}) => r), file, lastLabel, project: quantSource() ? path.join(quantSource(), 'quank_dataset') : ''};
  }
  return {
    record, label, view, load,
    async tick() { const c = new Date(now() + 8 * 3600e3), m = c.getUTCHours() * 60 + c.getUTCMinutes(); if (m < 15 * 60 + 30 || now() - lastLabel < 6 * 3600e3) return null; return label(); },
    async handle(p = {}) {
      const a = p.action;
      await load();
      if (a === 'view') return view();
      if (a === 'label') return {...(await label({max: 40})), view: view()};
      if (a === 'export') {
        const fmt = p.format === 'jsonl' ? 'jsonl' : 'csv', only = p.labelledOnly !== false, body = fmt === 'csv' ? toCsv(rows, {labelledOnly: only}) : toJsonl(rows, {labelledOnly: only});
        const count = only ? rows.filter(r => r.label?.complete).length : rows.length;
        if (!count) throw new Error(only ? '还没有标注完成的记录（信号要过 20 个交易日才能标注收益）' : '还没有记录');
        if (p.target === 'project') {
          const src = quantSource();
          if (!src) throw new Error('还没有导入策略项目');
          const out = path.join(src, 'quank_dataset'), f = path.join(out, `signals${only ? '_labelled' : ''}.${fmt}`);
          await mkdir(out, {recursive: true}); await writeFile(f, body);
          log('训练数据已导出', `${count} 条 → 策略项目 quank_dataset/`);
          return {file: f, count};
        }
        if (!saveDialog) throw new Error('当前环境不能选择保存位置');
        const f = await saveDialog({name: `QuankSight-训练数据-${cstDay(now())}.${fmt}`, ext: fmt});
        if (!f) return {cancelled: true};
        await writeFile(f, body);
        log('训练数据已导出', `${count} 条`);
        return {file: f, count};
      }
      if (a === 'clear') { rows = []; dirty = true; await save(); notify(); return {cleared: true}; }
      throw new Error('未知的训练数据操作');
    },
  };
}
