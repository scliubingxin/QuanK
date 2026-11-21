// [F4] 组合与风控 service (main process).
// Positions = engine holdings (quant store, refreshed on demand) + manual holdings; prices from the market service;
// industries from the knowledge service (F10 profile). Rules are checked every N minutes in trading hours and once after
// the close; new breaches go to 动态 and a system notification (once per breach per day). Nothing places orders.
import { mergePositions, summarizePortfolio, navSeries, riskMetrics, correlationMatrix, betaOf, checkRules, normalizeRules, parseRules, describeRules, normalizeManual, industryOf,
  presetScenarios, normalizeScenario, adjustedBeta, stressTest, simulateRebalance, navSvg, allocationSvg, allocationRows, portfolioReport, MANUAL_LIMIT, BENCH, UNCLASSIFIED, num } from '../src/shared/portfolio.js';
import { session } from '../src/shared/market.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const isCode = c => /^\d{6}$/.test(String(c || ''));
const cst = t => { const d = new Date(t + 8 * 3600e3); return {day: d.toISOString().slice(0, 10), weekday: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes()}; };
const ALERT_LIMIT = 100, BAR_TTL = 30 * 60e3;

export function createPortfolioService({store, quant = null, market = null, knowledge = null, research = null, notify = () => {}, onAlert = () => {}, now = Date.now, bars = 250} = {}) {
  const barCache = new Map();
  let busy = false;
  const st = () => {
    const p = (store.data.portfolio ??= {});
    p.manual ??= []; p.alerts ??= []; p.fired ??= {};
    p.cash = Math.max(0, num(p.cash) ?? 0);
    p.rules = normalizeRules(p.rules);
    return p;
  };
  const pool = () => (store.data.quant?.pool || []).filter(x => isCode(x.code));
  const profiles = () => store.data.knowledge?.profiles || {};

  async function industries(codes, {fetch = true} = {}) {
    const out = {}, missing = [];
    for (const c of codes) { const ind = profiles()[c]?.profile?.industry; if (ind) out[c] = industryOf(ind); else missing.push(c); }
    if (fetch && knowledge) for (const c of missing.slice(0, 8)) { try { const r = await knowledge.handle({action: 'profile', code: c}); out[c] = industryOf(r?.profile?.industry); } catch { out[c] = UNCLASSIFIED; } }
    return out;
  }
  async function quotes(codes) {
    if (!market || !codes.length) return {};
    try { const r = await market.handle({action: 'quotes', codes}); return Object.fromEntries((r?.quotes || []).filter(q => q?.code).map(q => [q.code, q])); } catch { return {}; }
  }
  async function barsOf(code) {
    const hit = barCache.get(code);
    if (hit && now() - hit.at < BAR_TTL) return hit.bars;
    const k = await market.handle({action: 'kline', code, period: 'day', count: bars});
    const b = Array.isArray(k?.bars) ? k.bars : [];
    barCache.set(code, {at: now(), bars: b, quote: k?.quote || null}); if (barCache.size > 120) barCache.delete(barCache.keys().next().value);
    return b;
  }
  async function benchBars() {
    const hit = barCache.get(BENCH.id);
    if (hit && now() - hit.at < BAR_TTL) return hit.bars;
    try { const k = await market.handle({action: 'indexKline', id: BENCH.id, count: bars}); const b = k?.bars || []; barCache.set(BENCH.id, {at: now(), bars: b}); return b; } catch { return []; }
  }
  async function barsMap(codes) {
    const out = {}, errors = {}, queue = [...codes];
    if (!market) return {bars: out, errors};
    await Promise.all(Array.from({length: Math.min(4, queue.length)}, async () => { while (queue.length) { const c = queue.shift(); try { out[c] = await barsOf(c); } catch (e) { errors[c] = clip(e?.message || e, 120); } } }));
    return {bars: out, errors};
  }

  async function positions({fresh = false} = {}) {
    const p = st();
    if (fresh && quant && store.data.quant?.features?.holdings) { try { await quant.handle({action: 'holdings'}); } catch {} }
    const engine = store.data.quant?.holdings || {};
    const codes = [...new Set([...Object.keys(engine).filter(c => num(engine[c]?.shares) > 0), ...p.manual.map(m => m.code)])];
    const [q, ind] = await Promise.all([quotes(codes), industries(codes, {fetch: fresh || codes.some(c => !profiles()[c])})]);
    // the batch quote host can be refused on some networks: fall back to the K-line service (Tencent backup) for the price
    for (const c of codes.filter(c => num(q[c]?.price) === null).slice(0, 20)) {
      try { const b = await barsOf(c), hit = barCache.get(c), last = b.at(-1), prev = b.at(-2), lq = hit?.quote;
        const price = num(lq?.price) ?? num(last?.close);
        if (price !== null) q[c] = {code: c, name: lq?.name || '', price, pct: num(lq?.pct) ?? (prev && num(prev.close) ? Math.round((price / prev.close - 1) * 1e4) / 100 : null), source: 'kline'}; } catch {}
    }
    const list = mergePositions({engine, manual: p.manual, pool: pool(), quotes: q, industries: ind, stops: p.rules.stops});
    return {list, quotes: q, industries: ind};
  }
  const highsOf = (bm, list) => Object.fromEntries(list.map(x => { const b = (bm[x.code] || []).slice(-60).map(y => num(y.close)).filter(v => v > 0); return [x.code, b.length ? Math.max(...b) : null]; }));
  const noticesOf = codes => { const n = store.data.research?.notices || {}; return Object.fromEntries(codes.map(c => [c, n[c]?.list || []])); };

  async function overview({fresh = false, withBars = true} = {}) {
    const p = st(), {list} = await positions({fresh}), summary = summarizePortfolio(list, p.cash);
    const priced = list.filter(x => x.value !== null).map(x => x.code);
    const {bars: bm, errors} = withBars ? await barsMap(priced) : {bars: {}, errors: {}};
    const nav = navSeries(list, bm, p.cash), bench = withBars && nav.length ? await benchBars() : [];
    const breaches = checkRules({summary, rules: p.rules, nav, highs: highsOf(bm, list), notices: noticesOf(list.map(x => x.code)), today: cst(now()).day});
    return {summary, nav, bench, bars: bm, errors, breaches, rules: p.rules, rulesText: describeRules(p.rules), at: now()};
  }
  const publicOverview = o => ({summary: o.summary, nav: o.nav, breaches: o.breaches, rules: o.rules, rulesText: o.rulesText, errors: o.errors, at: o.at,
    svg: {nav: navSvg(o.nav, o.bench), stocks: allocationSvg(allocationRows(o.summary, 'stock'), {cap: o.rules.maxPosition < 100 ? o.rules.maxPosition : null}), industries: allocationSvg(allocationRows(o.summary, 'industry'), {cap: o.rules.maxIndustry < 100 ? o.rules.maxIndustry : null, title: '行业分布'})}});

  async function risk(o0 = null) {
    const o = o0 || await overview();
    const metrics = riskMetrics(o.nav, o.bench), items = o.summary.positions.filter(x => x.value !== null);
    const corr = correlationMatrix(o.bars, items), betas = {};
    for (const x of items) { const b = betaOf(o.bars[x.code], o.bench); betas[x.code] = {...b, adjusted: b.beta === null ? null : Math.round(adjustedBeta(b.beta) * 100) / 100, name: x.name, weight: x.weight}; }
    return {metrics, corr, betas, benchmark: BENCH.name, nav: o.nav.length, svg: navSvg(o.nav, o.bench), errors: o.errors, note: '按当前持仓数量回溯历史行情估算，不是实际交易记录。'};
  }
  async function stress(p = {}, o0 = null) {
    const o = o0 || await overview(), betas = {};
    for (const x of o.summary.positions) if (o.bars[x.code]) betas[x.code] = betaOf(o.bars[x.code], o.bench).beta;
    const list = p.scenario ? [normalizeScenario(p.scenario)] : presetScenarios(o.summary);
    return {results: list.map(s => stressTest(o.summary, s, {betas, rules: o.rules})), betas, presets: presetScenarios(o.summary), total: o.summary.total};
  }
  async function simulate(p = {}) {
    const s = st(), {list, quotes: q, industries: ind} = await positions();
    const changes = Array.isArray(p.changes) ? p.changes : [];
    const extra = changes.map(c => String(c?.code || '')).filter(c => isCode(c) && !q[c]);
    const q2 = {...q, ...(await quotes(extra))}, ind2 = {...ind, ...(await industries(extra))};
    const r = simulateRebalance(list, s.cash, changes, {quotes: q2, industries: ind2});
    const before = checkRules({summary: r.before, rules: s.rules}).filter(b => b.kind !== 'notice'), after = checkRules({summary: r.after, rules: s.rules}).filter(b => b.kind !== 'notice');
    const codes = [...new Set([...r.before.positions, ...r.after.positions].map(x => x.code))], {bars: bm} = await barsMap(codes), bench = await benchBars(), betas = {};
    for (const c of codes) if (bm[c]?.length && bench.length) betas[c] = betaOf(bm[c], bench).beta;
    const opt = {betas, rules: s.rules};
    return {...r, breachesBefore: before, breachesAfter: after, stressBefore: stressTest(r.before, {kind: 'market', pct: -10}, opt), stressAfter: stressTest(r.after, {kind: 'market', pct: -10}, opt), note: '只做计算，不会下单。'};
  }

  async function check({auto = false} = {}) {
    if (busy) return {skipped: true};
    busy = true;
    const p = st();
    try {
      const o = await overview(), day = cst(now()).day, fresh = [];
      for (const b of o.breaches) { if (b.level === 'low') continue; const k = `${b.key}@${day}`; if (p.fired[k]) continue; p.fired[k] = now(); fresh.push(b); }
      for (const k of Object.keys(p.fired)) if (now() - p.fired[k] > 8 * 86400e3) delete p.fired[k];
      if (fresh.length) {
        p.alerts = [...fresh.map(b => ({id: 'pf-' + now().toString(36) + Math.random().toString(36).slice(2, 6), time: now(), kind: b.kind, level: b.level, label: b.label, code: b.code || '', title: b.title, detail: b.detail || ''})), ...p.alerts].slice(0, ALERT_LIMIT);
        if (auto) {
          store.data.activity = [...fresh.map(b => ({id: 'pf-' + now().toString(36) + (b.code || b.kind), title: '风控提醒', code: b.code || '', detail: clip(`${b.title}${b.detail ? '。' + b.detail : ''}`, 200), time: now()})), ...(store.data.activity || [])].slice(0, 500);
          if (p.rules.notify) { const head = fresh[0]; try { onAlert({title: fresh.length > 1 ? `风控提醒 · ${fresh.length} 条` : `风控提醒 · ${head.label}`, detail: clip(fresh.length > 1 ? fresh.map(b => b.title).join('；') : head.title, 180), code: head.code || ''}); } catch {} }
        }
      }
      p.lastCheck = now(); delete p.lastError;
      await store.save?.(); notify();
      return {breaches: o.breaches, fresh, summary: o.summary};
    } catch (e) { p.lastCheck = now(); p.lastError = clip(e?.message || e, 160); await store.save?.(); throw e; } finally { busy = false; }
  }

  async function report({format = 'docx'} = {}) {
    if (!research) throw new Error('当前环境不能生成文档');
    const o = await overview({fresh: true}), r = await risk(o), s = await stress({}, o), day = cst(now()).day;
    const spec = portfolioReport({summary: o.summary, breaches: o.breaches, metrics: r.metrics, corr: r.corr, stress: s.results, rules: o.rules, date: day});
    const svgs = {};
    if (o.nav.length > 1) svgs.nav = navSvg(o.nav, o.bench);
    if (o.summary.priced) svgs.alloc = allocationSvg(allocationRows(o.summary, 'stock'), {cap: o.rules.maxPosition < 100 ? o.rules.maxPosition : null});
    const {document: doc} = await research.handle({action: 'render', spec, format, svgs});
    await research.handle({action: 'archive', kind: 'export', title: spec.title, summary: spec.summary, documentId: doc.id, format, tags: ['组合风控']});
    return {document: doc, summary: spec.summary, sections: spec.sections.map(x => x.title)};
  }

  function view() {
    const p = st();
    return {manual: p.manual.map(m => ({...m})), cash: p.cash, rules: {...p.rules, stops: {...p.rules.stops}}, rulesText: describeRules(p.rules), alerts: p.alerts.slice(0, 30), lastCheck: p.lastCheck || null, lastError: p.lastError || ''};
  }

  return {
    view, overview, check,
    async tick() {
      const p = st();
      if (!p.rules.enabled || busy || (!p.manual.length && !Object.values(store.data.quant?.holdings || {}).some(h => num(h?.shares) > 0))) return;
      const t = cst(now()), ses = session(now());
      if (ses === 'open') { if (now() - (p.lastCheck || 0) >= p.rules.interval * 60e3) await check({auto: true}); return; }
      if (t.weekday >= 1 && t.weekday <= 5 && t.minutes >= 905 && t.minutes < 1380 && p.closeCheck !== t.day) { p.closeCheck = t.day; await check({auto: true}); }
    },
    async handle(a = {}) {
      const x = a.action, p = st();
      if (x === 'view') return view();
      if (x === 'overview') return publicOverview(await overview({fresh: a.fresh === true}));
      if (x === 'risk') return risk();
      if (x === 'stress') return stress(a);
      if (x === 'simulate') return simulate(a);
      if (x === 'check') return check({auto: false});
      if (x === 'report') return report({format: ['docx', 'pptx', 'html'].includes(a.format) ? a.format : 'docx'});
      if (x === 'holdingSave') {
        const m = normalizeManual(a), i = p.manual.findIndex(y => y.code === m.code);
        if (i < 0 && p.manual.length >= MANUAL_LIMIT) throw new Error(`手动持仓最多 ${MANUAL_LIMIT} 只`);
        if (!m.name) m.name = pool().find(y => y.code === m.code)?.name || '';
        if (!m.name && market) { try { m.name = clip((await quotes([m.code]))[m.code]?.name, 20); } catch {} }
        const next = {...m, at: now()};
        p.manual = i < 0 ? [...p.manual, next] : p.manual.map((y, j) => j === i ? next : y);
        await store.save?.(); notify(); return {holding: next};
      }
      if (x === 'holdingRemove') { const n = p.manual.length; p.manual = p.manual.filter(y => y.code !== String(a.code || '')); if (n === p.manual.length) throw new Error('没有这条手动持仓'); await store.save?.(); notify(); return {removed: String(a.code)}; }
      if (x === 'cash') { const c = num(a.cash); if (c === null || c < 0 || c > 1e12) throw new Error('现金金额应为不小于 0 的数字'); p.cash = Math.round(c * 100) / 100; await store.save?.(); notify(); return {cash: p.cash}; }
      if (x === 'rules') { p.rules = parseRules(a.rules || {}, p.rules); await store.save?.(); notify(); return {rules: p.rules, text: describeRules(p.rules)}; }
      if (x === 'clearAlerts') { p.alerts = []; await store.save?.(); notify(); return {cleared: true}; }
      throw new Error('未知的组合操作');
    },
  };
}
