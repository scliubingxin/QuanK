// [F4] 组合与风控: positions & allocation (M1), rules & alerts (M2), risk metrics (M3), stress tests & rebalance (M4),
// service (dedupe, schedule, report), index K lines, chat tools, UI, wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as P from '../src/shared/portfolio.js';
import { createPortfolioService } from '../services/portfolio.mjs';
import { createMarketService } from '../services/market.mjs';
import { portfolioUI, portfolioBox } from '../src/ui/portfolio.js';
import { executeAppTool, appToolDefinitions, APP_INTENT } from '../services/app-tools.mjs';
import { reportToDocx } from '../src/shared/research.js';
import { generateDocument } from '../runtime/documents.mjs';
import { buildFeed } from '../src/shared/feed.js';

/** n weekday bars ending 2026-11-20; close(i) from fn. */
function bars(n, fn) {
  const out = []; let d = Date.UTC(2026, 10, 20);
  const days = [];
  while (days.length < n) { const w = new Date(d).getUTCDay(); if (w !== 0 && w !== 6) days.unshift(new Date(d).toISOString().slice(0, 10)); d -= 86400e3; }
  days.forEach((date, i) => { const c = fn(i); out.push({date, open: c, close: c, high: c, low: c, volume: 1}); });
  return out;
}
const wave = (base, amp, k = 0.3) => i => base * (1 + amp * Math.sin(i * k)) * (1 + i * 0.0005);
const POS = () => P.mergePositions({engine: {'600438': {shares: 1000, cost: 30, price: 20}, '000001': {shares: 0, cost: 10}}, manual: [{code: '600519', shares: 100, cost: 1500, stopPrice: 1400}],
  pool: [{code: '600438', name: '通威股份'}, {code: '600519', name: '贵州茅台'}], quotes: {'600519': {price: 1450, pct: 1}, '600438': {price: 21, pct: 5}}, industries: {'600438': '电气设备', '600519': '食品饮料'}});

test('M1 positions: engine + manual, quotes, weights with cash, industries, concentration', () => {
  const pos = POS();
  assert.equal(pos.length, 2, 'zero-share engine rows are dropped');
  const tw = pos.find(p => p.code === '600438'), mt = pos.find(p => p.code === '600519');
  assert.equal(tw.price, 21); assert.equal(tw.value, 21000); assert.equal(tw.pnl, -9000); assert.equal(tw.pnlPct, -30); assert.equal(tw.source, 'engine');
  assert.equal(tw.dayPnl, 1000);
  assert.equal(mt.source, 'manual'); assert.equal(mt.stopPrice, 1400); assert.equal(mt.name, '贵州茅台');
  const manualWins = P.mergePositions({engine: {'600519': {shares: 5, cost: 1}}, manual: [{code: '600519', shares: 100, cost: 1500}]});
  assert.equal(manualWins[0].shares, 100);
  const s = P.summarizePortfolio(pos, 34000);
  assert.equal(s.total, 200000); assert.equal(s.invested, 166000); assert.equal(s.cashPct, 17); assert.equal(s.stockPct, 83);
  assert.deepEqual(s.positions.map(p => p.weight), [72.5, 10.5]);
  assert.deepEqual(s.byIndustry.map(g => [g.industry, g.weight]), [['食品饮料', 72.5], ['电气设备', 10.5]]);
  assert.equal(s.top.code, '600519');
  assert.ok(s.effective > 1 && s.effective < 2);
  assert.equal(P.industryOf('电气设备-电源设备-太阳能'), '电气设备');
  assert.equal(P.industryOf(''), P.UNCLASSIFIED);
  assert.throws(() => P.normalizeManual({code: '60043', shares: 1, cost: 1}), /6 位/);
  assert.throws(() => P.normalizeManual({code: '600438', shares: 1.5, cost: 1}), /正整数/);
  assert.throws(() => P.normalizeManual({code: '600438', shares: 1, cost: 0}), /成本价/);
  assert.deepEqual(P.normalizeManual({code: '600438', shares: '200', cost: '21.355', stopPrice: ''}), {code: '600438', name: '', shares: 200, cost: 21.355, stopPrice: null, note: ''});
});

test('M1/M3 series: back-calculated value curve, drawdown, beta, VaR, correlation', () => {
  const bench = bars(120, wave(4000, 0.05));
  const twice = bench.map((b, i) => ({...b, close: i ? null : 20})); // stock moving 2x the benchmark each day
  let c = 20; for (let i = 1; i < bench.length; i++) { c *= 1 + 2 * (bench[i].close / bench[i - 1].close - 1); twice[i].close = c; }
  const later = bars(60, i => 100 + i);
  const pos = [{code: 'A', name: 'A', shares: 100, price: c, value: 100 * c}, {code: 'B', name: 'B', shares: 10, price: 159, value: 1590}];
  const nav = P.navSeries(pos, {A: twice, B: later}, 1000);
  assert.equal(nav.length, 60, 'starts where every holding has data');
  assert.equal(nav[0].date, later[0].date);
  assert.equal(nav.at(-1).value, Math.round((100 * c + 10 * 159 + 1000) * 100) / 100);
  const b = P.betaOf(twice, bench);
  assert.ok(Math.abs(b.beta - 2) < 0.01, `beta ${b.beta}`); assert.ok(b.corr > 0.99);
  const dd = P.drawdown([{date: '1', value: 100}, {date: '2', value: 120}, {date: '3', value: 90}, {date: '4', value: 110}]);
  assert.deepEqual([dd.max, dd.from, dd.to, dd.current], [25, '2', '3', 8.33]);
  const m = P.riskMetrics(twice.map(x => ({date: x.date, value: x.close})), bench);
  assert.ok(Math.abs(m.beta - 2) < 0.01); assert.ok(m.volatility > 0); assert.ok(m.var95 > 0 && m.cvar95 >= m.var95);
  assert.ok(m.varAmount > 0); assert.equal(m.days, 119); assert.ok(m.maxDrawdown > 0);
  assert.equal(P.riskMetrics(nav.slice(0, 10), bench), null, 'needs 20 returns');
  const inv = bench.map(x => ({...x, close: 8000 - x.close}));
  const cm = P.correlationMatrix({A: twice, X: bench, Y: inv}, [{code: 'A', name: 'A'}, {code: 'X', name: 'X'}, {code: 'Y', name: 'Y'}]);
  assert.equal(cm.matrix[0][0], 1); assert.ok(cm.matrix[0][1] > 0.99); assert.ok(cm.matrix[1][2] < -0.99);
  assert.deepEqual(cm.high.map(p => p.names.join('/')), ['A/X']);
});

test('M2 rules: defaults, parsing, turning lines off, per-stock stop prices', () => {
  const d = P.normalizeRules(null);
  assert.equal(d.stopLoss, 8); assert.equal(d.maxPosition, 30); assert.equal(d.takeProfit, null); assert.equal(d.interval, 15); assert.equal(d.enabled, true);
  assert.equal(P.normalizeRules({stopLoss: 99, interval: 7}).stopLoss, 8, 'out of range falls back');
  const r = P.parseRules({stopLoss: '12', takeProfit: '30%', trailing: '', maxPosition: '', maxDrawdown: '15', interval: '30', notices: false, stops: {'600438': {stopPrice: '18.5'}}});
  assert.deepEqual([r.stopLoss, r.takeProfit, r.trailing, r.maxPosition, r.maxDrawdown, r.interval, r.notices], [12, 30, null, 100, 15, 30, false]);
  assert.deepEqual(r.stops, {'600438': {stopPrice: 18.5}});
  assert.deepEqual(P.parseRules({stops: {'600438': {stopPrice: ''}}}, r).stops, {});
  assert.throws(() => P.parseRules({stopLoss: 70}), /止损线应在 1%–50%/);
  assert.throws(() => P.parseRules({interval: 7}), /5 \/ 15 \/ 30 \/ 60/);
  assert.match(P.describeRules(r), /亏损 12% 止损 · 盈利 30% 止盈 · 单行业 ≤ 50% · 组合回撤 15% · 交易时段每 30 分钟检查 · 系统通知/);
  assert.equal(P.describeRules({enabled: false}), '风控提醒未开启');
});

test('M2 checks: stop loss / stop price / take profit / trailing / caps / drawdown / risk notices', () => {
  const pos = POS(), s = P.summarizePortfolio(pos, 34000);
  const nav = [{date: 'a', value: 100}, {date: 'b', value: 100}, {date: 'c', value: 120}, {date: 'd', value: 110}, {date: 'e', value: 100}, {date: 'f', value: 102}];
  const notices = {'600438': [{id: 'N1', title: '关于收到立案告知书的公告', date: '2026-11-19', type: 'risk', label: '风险事项'}, {id: 'N2', title: '控股股东股份质押的公告', date: '2026-11-18', type: 'holder', label: '股东变动'}, {id: 'N3', title: '关于收到问询函的公告', date: '2026-10-01', type: 'risk', label: '风险事项'}, {id: 'N4', title: '股东增持计划', date: '2026-11-20', type: 'holder', label: '股东变动'}]};
  const out = P.checkRules({summary: s, rules: {takeProfit: 20, trailing: 10, maxDrawdown: 12}, nav, highs: {'600438': 32}, notices, today: '2026-11-21'});
  const kinds = out.map(b => b.kind);
  assert.ok(kinds.includes('stopLoss'));
  assert.ok(!kinds.includes('stopPrice'), '1450 is above the 1400 stop price');
  assert.ok(kinds.includes('position') && kinds.includes('industry') && kinds.includes('drawdown'));
  assert.ok(!kinds.includes('takeProfit') && !kinds.includes('trailing'), 'losing positions do not trip profit rules');
  assert.deepEqual(out.filter(b => b.kind === 'notice').map(b => [b.noticeId, b.level]), [['N1', 'high'], ['N2', 'medium']]);
  assert.equal(out[0].level, 'high'); assert.equal(out.at(-1).level === 'high', false);
  assert.match(out.find(b => b.kind === 'stopLoss').title, /通威股份（600438）亏损 30%，触及止损线 -8%/);
  assert.equal(out.find(b => b.kind === 'drawdown').key, 'drawdown:pf');
  const hi = P.summarizePortfolio(P.mergePositions({engine: {'600438': {shares: 1000, cost: 10}}, quotes: {'600438': {price: 14}}}), 0);
  const tp = P.checkRules({summary: hi, rules: {takeProfit: 30, trailing: 10, maxPosition: 100}, highs: {'600438': 16}}).map(b => b.kind);
  assert.deepEqual(tp.sort(), ['takeProfit', 'trailing']);
  const sp = P.summarizePortfolio(P.mergePositions({manual: [{code: '600519', shares: 1, cost: 1500, stopPrice: 1460}], quotes: {'600519': {price: 1450}}}), 0);
  assert.deepEqual(P.checkRules({summary: sp, rules: {maxPosition: 100}}).map(b => b.kind), ['stopPrice']);
  const near = P.summarizePortfolio(P.mergePositions({engine: {'600438': {shares: 100, cost: 10}}, quotes: {'600438': {price: 9.3}}}), 0);
  assert.deepEqual(P.checkRules({summary: near, rules: {maxPosition: 100}}).map(b => [b.kind, b.level]), [['nearStop', 'low']]);
});

test('M4 stress tests, presets, scenarios and rebalance simulation', () => {
  const s = P.summarizePortfolio(POS(), 34000);
  const m = P.stressTest(s, {kind: 'market', pct: -10}, {betas: {'600519': 0.8, '600438': 1.5}});
  assert.equal(P.adjustedBeta(1), 1); assert.equal(P.adjustedBeta(null), 1); assert.equal(P.adjustedBeta(-2), 0); assert.ok(Math.abs(P.adjustedBeta(0) - 0.33) < 1e-9);
  assert.deepEqual(m.rows.map(r => [r.code, r.shock, r.loss, r.basis]), [['600519', -8.66, -12557, '调整后 Beta 0.87'], ['600438', -13.35, -2803.5, '调整后 Beta 1.34']]);
  assert.equal(m.loss, -15360.5); assert.equal(m.lossPct, -7.68); assert.equal(m.after, 184639.5); assert.equal(m.worst.code, '600519');
  assert.deepEqual(m.stops, ['贵州茅台', '通威股份'], 'both end below their stop price / stop line');
  const ind = P.stressTest(s, {kind: 'industry', industry: '电气设备', pct: -20});
  assert.deepEqual(ind.rows.map(r => r.loss), [0, -4200]);
  const st = P.stressTest(s, {kind: 'stock', code: '600519', pct: -27});
  assert.equal(st.loss, -39150);
  assert.deepEqual(P.stressTest(s, {kind: 'market', pct: -10}).rows.map(r => [r.shock, r.basis])[0], [-10, 'Beta 按 1'], 'missing beta = 1');
  assert.deepEqual(P.presetScenarios(s).map(x => x.id), ['m5', 'm10', 'm20', 'ind', 'top']);
  assert.match(P.presetScenarios(s).at(-1).title, /贵州茅台连续三个跌停/);
  assert.throws(() => P.normalizeScenario({kind: 'market', pct: -95}), /-90%/);
  assert.throws(() => P.normalizeScenario({kind: 'stock', pct: -5, code: 'x'}), /6 位/);
  assert.equal(P.normalizeScenario({kind: 'market', pct: '-15'}).title, '大盘下跌 15%');
  const pos = POS();
  const r = P.simulateRebalance(pos, 34000, [{code: '600438', delta: -1000}, {code: '000858', delta: 100, price: 130}], {industries: {'000858': '食品饮料'}});
  assert.equal(r.after.positions.length, 2); assert.ok(!r.after.positions.some(p => p.code === '600438'));
  assert.equal(r.cash, 34000 + 21000 - 13000); assert.equal(r.after.total, r.before.total);
  assert.equal(r.after.byIndustry[0].industry, '食品饮料');
  assert.throws(() => P.simulateRebalance(pos, 0, [{code: '600438', delta: -2000}]), /持有 1000 股，不能卖出 2000 股/);
  assert.throws(() => P.simulateRebalance(pos, 0, [{code: '000002', delta: 100}]), /没有现价/);
  assert.equal(P.simulateRebalance(pos, 0, [{code: '600519', delta: 100}]).shortfall, 145000);
  const add = P.simulateRebalance(pos, 1e6, [{code: '600519', delta: 100, price: 1300}]).after.positions.find(p => p.code === '600519');
  assert.equal(add.shares, 200); assert.equal(add.cost, 1400);
});

test('charts and report: value curve, allocation bars, Word report', async () => {
  const nav = bars(80, wave(100000, 0.08)).map(b => ({date: b.date, value: b.close})), bench = bars(80, wave(4000, 0.03));
  const svg = P.navSvg(nav, bench);
  assert.match(svg, /^<svg[^>]+viewBox="0 0 960 300"/); assert.match(svg, /组合 [+-]/); assert.match(svg, /沪深300/); assert.match(svg, /回撤（最深/);
  assert.equal((svg.match(/<polyline/g) || []).length, 2); assert.ok(!/NaN|undefined/.test(svg));
  assert.match(P.navSvg([nav[0]]), /行情数据不足/);
  const s = P.summarizePortfolio(POS(), 34000);
  const al = P.allocationSvg(P.allocationRows(s), {cap: 30});
  assert.match(al, /贵州茅台/); assert.match(al, /现金/); assert.match(al, /上限 30%/); assert.match(al, /#ef4444/);
  assert.match(P.allocationSvg([]), /还没有可计算市值/);
  const breaches = P.checkRules({summary: s, rules: {}});
  const spec = P.portfolioReport({summary: s, breaches, metrics: P.riskMetrics(nav, bench), stress: [P.stressTest(s, {kind: 'market', pct: -10})], date: '2026-11-21'});
  assert.equal(spec.title, '组合风控报告 · 2026-11-21');
  assert.deepEqual(spec.sections.map(x => x.title), ['组合概况', '行业分布', '风控检查', '风险指标', '压力测试', '说明']);
  assert.equal(spec.sections[0].chart, 'alloc'); assert.equal(spec.sections[3].chart, 'nav');
  assert.match(spec.sections[2].bullets[0], /【止损】/);
  const doc = await generateDocument('docx', reportToDocx(spec, {charts: ['a']}));
  assert.ok(doc.bytes.length > 2000);
});

// ---------- service ----------
function harness({session = 'open'} = {}) {
  const store = {data: {quant: {pool: [{code: '600438', name: '通威股份'}], features: {holdings: true}, holdings: {'600438': {shares: 1000, cost: 30, price: 20}}}, research: {notices: {'600438': {list: [{id: 'N1', title: '关于收到立案告知书的公告', date: '2026-11-20', type: 'risk', label: '风险事项'}]}}}}, saves: 0};
  store.save = async () => { store.saves++; };
  // 2026-11-20 (Fri) 10:00 CST = 02:00 UTC; 16:00 CST closed
  let t = session === 'open' ? Date.UTC(2026, 10, 20, 2, 0) : Date.UTC(2026, 10, 20, 8, 0);
  const calls = [];
  const market = {async handle(p) { calls.push(p.action); if (p.action === 'quotes') return {quotes: p.codes.map(c => ({code: c, name: c === '600519' ? '贵州茅台' : '通威股份', price: c === '600519' ? 1450 : 21, pct: 1}))}; if (p.action === 'kline') return {bars: bars(120, wave(p.code === '600519' ? 1500 : 22, 0.06))}; if (p.action === 'indexKline') return {bars: bars(120, wave(4000, 0.03))}; if (p.action === 'resolve') return {code: '600519', name: '贵州茅台'}; throw new Error('?'); }};
  const knowledge = {async handle(p) { calls.push('profile:' + p.code); return {profile: {industry: p.code === '600519' ? '食品饮料-白酒' : '电气设备-电源设备'}}; }};
  const quant = {async handle(p) { calls.push('quant:' + p.action); return {}; }};
  const docs = [];
  const research = {async handle(p) { docs.push(p); return p.action === 'render' ? {document: {id: 'doc1', name: p.spec.title, format: p.format}} : {item: {}}; }};
  const alerts = [];
  const svc = createPortfolioService({store, market, knowledge, quant, research, now: () => t, onAlert: a => alerts.push(a), notify: () => {}});
  return {svc, store, calls, alerts, docs, set: v => { t = v; }, get t() { return t; }};
}

test('service: overview, manual holdings, cash, rules, check de-duplication and alerts', async () => {
  const h = harness();
  await assert.rejects(h.svc.handle({action: 'holdingSave', code: '600519', shares: 0, cost: 1}), /正整数/);
  const saved = await h.svc.handle({action: 'holdingSave', code: '600519', shares: 100, cost: 1500});
  assert.equal(saved.holding.name, '贵州茅台', 'name from the quote');
  assert.equal((await h.svc.handle({action: 'cash', cash: 34000})).cash, 34000);
  await assert.rejects(h.svc.handle({action: 'cash', cash: -1}), /不小于 0/);
  const o = await h.svc.handle({action: 'overview', fresh: true});
  assert.ok(h.calls.includes('quant:holdings'), 'fresh re-reads engine holdings');
  assert.equal(o.summary.total, 200000);
  assert.deepEqual(o.summary.byIndustry.map(g => g.industry), ['食品饮料', '电气设备']);
  assert.ok(o.nav.length > 100); assert.match(o.svg.nav, /<svg/); assert.match(o.svg.stocks, /上限 30%/);
  assert.ok(o.breaches.some(b => b.kind === 'notice' && b.noticeId === 'N1'));
  const r = await h.svc.handle({action: 'rules', rules: {maxPosition: '', maxIndustry: ''}});
  assert.match(r.text, /亏损 8% 止损/); assert.equal(h.store.data.portfolio.rules.maxPosition, 100);
  const c1 = await h.svc.check({auto: true});
  assert.ok(c1.fresh.length >= 2);
  assert.equal(h.alerts.length, 1, 'one notification for the batch');
  assert.match(h.alerts[0].title, /风控提醒/);
  assert.ok(h.store.data.activity.every(a => a.title === '风控提醒'));
  const c2 = await h.svc.check({auto: true});
  assert.equal(c2.fresh.length, 0, 'same breach is not repeated on the same day');
  assert.equal(h.alerts.length, 1);
  h.set(h.t + 86400e3);
  assert.ok((await h.svc.check({auto: true})).fresh.length >= 2, 'repeats the next day');
  assert.equal(h.svc.view().alerts.length, c1.fresh.length * 2);
  await h.svc.handle({action: 'clearAlerts'}); assert.equal(h.svc.view().alerts.length, 0);
  await h.svc.handle({action: 'holdingRemove', code: '600519'}); assert.equal(h.svc.view().manual.length, 0);
  await assert.rejects(h.svc.handle({action: 'holdingRemove', code: '600519'}), /没有这条/);
});

test('service: risk, stress, simulate and the Word report', async () => {
  const h = harness();
  await h.svc.handle({action: 'holdingSave', code: '600519', shares: 100, cost: 1500});
  const r = await h.svc.handle({action: 'risk'});
  assert.ok(r.metrics.days > 100); assert.ok(r.betas['600438'].beta !== null); assert.equal(r.betas['600438'].adjusted, Math.round(P.adjustedBeta(r.betas['600438'].beta) * 100) / 100); assert.equal(r.corr.codes.length, 2);
  const s = await h.svc.handle({action: 'stress'});
  assert.equal(s.results.length, 5); assert.ok(s.results[1].loss < 0);
  const one = await h.svc.handle({action: 'stress', scenario: {kind: 'industry', industry: '电气设备', pct: -20}});
  assert.equal(one.results.length, 1); assert.equal(one.results[0].loss, -4200);
  const sim = await h.svc.handle({action: 'simulate', changes: [{code: '600438', delta: -500}]});
  assert.equal(sim.after.positions.find(p => p.code === '600438').shares, 500);
  assert.ok(sim.stressAfter.loss > sim.stressBefore.loss, 'smaller loss after selling');
  const rep = await h.svc.handle({action: 'report'});
  assert.equal(rep.document.id, 'doc1');
  const render = h.docs.find(d => d.action === 'render');
  assert.deepEqual(Object.keys(render.svgs).sort(), ['alloc', 'nav']);
  assert.equal(render.format, 'docx');
  assert.deepEqual(h.docs.find(d => d.action === 'archive').tags, ['组合风控']);
});

test('service: price falls back to the K-line service when batch quotes are refused', async () => {
  const store = {data: {quant: {holdings: {'600438': {shares: 1000, cost: 30}}}}, save: async () => {}};
  const k = bars(30, i => 20 + i * 0.1);
  const market = {async handle(p) { if (p.action === 'quotes') throw new TypeError('fetch failed'); if (p.action === 'kline') return {bars: k, quote: p.code === '600438' ? {price: 23.5, pct: 1.2, name: '通威股份'} : null, source: 'tencent'}; if (p.action === 'indexKline') return {bars: []}; return {}; }};
  const svc = createPortfolioService({store, market});
  const o = await svc.handle({action: 'overview'});
  const p = o.summary.positions[0];
  assert.deepEqual([p.price, p.dayPct, p.name], [23.5, 1.2, '通威股份']);
  const m2 = {async handle(p) { if (p.action === 'quotes') return {quotes: []}; if (p.action === 'kline') return {bars: k}; return {bars: []}; }};
  const p2 = (await createPortfolioService({store, market: m2}).handle({action: 'overview'})).summary.positions[0];
  assert.equal(p2.price, k.at(-1).close); assert.equal(p2.dayPct, Math.round((k.at(-1).close / k.at(-2).close - 1) * 1e4) / 100);
});

test('service tick: trading-hours interval, one check after the close, nothing without holdings', async () => {
  const h = harness();
  let n = 0; const orig = h.svc.check; h.svc.check = orig; // tick uses the internal check; count through saves of lastCheck
  await h.svc.tick(); n = h.store.data.portfolio.lastCheck; assert.equal(n, h.t, 'checks in trading hours');
  h.set(h.t + 5 * 60e3); await h.svc.tick(); assert.equal(h.store.data.portfolio.lastCheck, n, 'waits for the 15-minute interval');
  h.set(h.t + 10 * 60e3); await h.svc.tick(); assert.equal(h.store.data.portfolio.lastCheck, h.t);
  const c = harness({session: 'closed'});
  await c.svc.tick(); const first = c.store.data.portfolio.lastCheck; assert.ok(first, 'one check after the close');
  c.set(c.t + 30 * 60e3); await c.svc.tick(); assert.equal(c.store.data.portfolio.lastCheck, first, 'only once per day');
  const e = harness(); e.store.data.quant.holdings = {}; await e.svc.tick(); assert.equal(e.store.data.portfolio?.lastCheck, undefined);
  const off = harness(); await off.svc.handle({action: 'rules', rules: {enabled: false}}); await off.svc.tick(); assert.equal(off.store.data.portfolio.lastCheck, undefined);
});

test('market: CSI 300 K lines with the Tencent fallback', async () => {
  const fetcher = async url => {
    if (url.includes('push2his')) throw new TypeError('fetch failed');
    if (url.includes('fqkline') && url.includes('sh000300')) return {ok: true, text: async () => JSON.stringify({code: 0, data: {sh000300: {day: [['2026-11-19', '3900', '3910', '3920', '3890', '100'], ['2026-11-20', '3910', '3880', '3915', '3870', '120']]}}})};
    if (url.includes('push2.eastmoney') || url.includes('qt.gtimg')) throw new TypeError('fetch failed');
    throw new Error('unexpected ' + url);
  };
  const m = createMarketService({store: {data: {}}, fetcher});
  const k = await m.handle({action: 'indexKline', id: '1.000300', count: 60});
  assert.equal(k.source, 'tencent'); assert.deepEqual(k.bars.map(b => b.close), [3910, 3880]);
  await assert.rejects(m.handle({action: 'indexKline', id: '000300'}), /指数代码无效/);
  const em = createMarketService({store: {data: {}}, fetcher: async () => ({ok: true, text: async () => JSON.stringify({rc: 0, data: {code: '000300', name: '沪深300', klines: ['2026-11-20,3910,3880,3915,3870,120,1,0.7,-0.77,-30,0.1']}})})});
  assert.equal((await em.handle({action: 'indexKline'})).name, '沪深300');
});

test('chat tools: definitions, overview, rules with confirmation, manual holdings, simulate, intent', async () => {
  const names = appToolDefinitions().map(d => d.function.name).filter(n => n.startsWith('app_pf_'));
  assert.deepEqual(names, ['app_pf_overview', 'app_pf_risk', 'app_pf_stress', 'app_pf_simulate', 'app_pf_rules', 'app_pf_holding_save', 'app_pf_holding_remove', 'app_pf_report']);
  const h = harness();
  const market = {handle: async p => p.action === 'resolve' ? {code: p.query === '茅台' ? '600519' : '600438', name: ''} : {}};
  const run = (name, args, yes = true) => executeAppTool(name, args, {store: h.store, deps: {portfolio: h.svc, market, notify() {}, openDocument() {}}, ask: async () => yes});
  let r = await run('app_pf_holding_save', {query: '茅台', shares: 100, cost: 1500}, false);
  assert.equal(r.status, 'denied'); assert.equal(h.svc.view().manual.length, 0);
  r = await run('app_pf_holding_save', {query: '茅台', shares: 100, cost: 1500, stopPrice: 1300});
  assert.equal(r.status, 'succeeded'); assert.equal(h.svc.view().manual[0].stopPrice, 1300);
  r = await run('app_pf_overview', {});
  assert.equal(r.total, 166000); assert.equal(r.positions.find(p => p.code === '600519').source, '手动录入');
  assert.ok(r.alerts.some(a => a.type === '止损'));
  r = await run('app_pf_rules', {stopLoss: 0, maxPosition: 40}, false);
  assert.equal(r.status, 'denied'); assert.equal(h.svc.view().rules.stopLoss, 8);
  r = await run('app_pf_rules', {stopLoss: 0, maxPosition: 40, stock: '通威', stopPrice: 18});
  assert.equal(r.status, 'succeeded'); assert.equal(h.svc.view().rules.stopLoss, null); assert.equal(h.svc.view().rules.maxPosition, 40);
  assert.deepEqual(h.svc.view().rules.stops, {'600438': {stopPrice: 18}});
  r = await run('app_pf_simulate', {changes: '通威 -500；600519 100 1400'});
  assert.equal(r.status, 'succeeded'); assert.deepEqual(r.changes.map(c => [c.code, c.delta, c.price]), [['600438', -500, 21], ['600519', 100, 1400]]);
  r = await run('app_pf_stress', {kind: 'stock', stock: '茅台', pct: -20});
  assert.equal(r.results[0].loss, -29000);
  r = await run('app_pf_risk', {}); assert.ok(r.metrics.volatility > 0);
  r = await run('app_pf_holding_remove', {query: '茅台'}); assert.equal(r.status, 'succeeded');
  for (const q of ['我的组合怎么样', '仓位重不重', '有没有触发止损线', '帮我做个压力测试', '模拟调仓一下', '算一下组合的波动率和 VaR', '设置风控规则']) assert.ok(APP_INTENT.test(q), q);
  for (const q of ['通威股份最新的股价是多少', '解释一下光伏产业链', '什么是知识库']) assert.ok(!APP_INTENT.test(q), q);
});

// ---------- UI ----------
test('UI: box, views, forms and lazy mounting with a per-document cache', async () => {
  const box = portfolioBox({rulesText: '亏损 8% 止损'});
  assert.match(box, /id="portfolioBox"/); assert.match(box, /data-pf="stress"/); assert.match(box, /data-action="pfHoldingNew"/);
  const h = harness();
  await h.svc.handle({action: 'holdingSave', code: '600519', shares: 100, cost: 1500});
  const o = await h.svc.handle({action: 'overview'});
  const ov = portfolioUI.overviewHtml(o);
  assert.match(ov, /总资产/); assert.match(ov, /手动/); assert.match(ov, /data-action="pfStop" data-id="600438"/); assert.match(ov, /data-action="pfHoldingEdit" data-id="600519"/);
  assert.ok(!/data-action="pfHoldingEdit" data-id="600438"/.test(ov), 'engine holdings are not editable here');
  assert.match(portfolioUI.overviewHtml({summary: {stocks: 0}}), /录入持仓/);
  assert.match(portfolioUI.rulesHtml(o, h.svc.view()), /立即检查/);
  assert.match(portfolioUI.riskHtml(await h.svc.handle({action: 'risk'})), /单日 VaR 95%[\s\S]*调整后 Beta/);
  assert.match(portfolioUI.riskHtml({metrics: null}), /不足 20 个交易日/);
  assert.match(portfolioUI.stressHtml(await h.svc.handle({action: 'stress'})), /大盘下跌 10%/);
  assert.match(portfolioUI.simulateHtml(await h.svc.handle({action: 'simulate', changes: [{code: '600438', delta: -500}]})), /卖出 500 股/);
  assert.deepEqual(portfolioUI.parseChanges('600438 -2000\n600519 100 1450'), [{code: '600438', delta: -2000}, {code: '600519', delta: 100, price: 1450}]);
  assert.throws(() => portfolioUI.parseChanges('茅台 买一点'), /看不懂/);
  const dom = new JSDOM(`<form>${portfolioUI.rulesForm({stopLoss: 8, maxPosition: 100, maxIndustry: 50, interval: 30, notify: false})}</form>`);
  const fm = new dom.window.FormData(dom.window.document.querySelector('form'));
  const pay = portfolioUI.rulesPayload(fm);
  assert.deepEqual([pay.rules.stopLoss, pay.rules.maxPosition, pay.rules.maxIndustry, pay.rules.interval, pay.rules.notify, pay.rules.enabled], ['8', '', '50', 30, false, true]);
  const hf = new JSDOM(`<form>${portfolioUI.holdingForm({code: '600519', shares: 100, cost: 1500})}</form>`).window;
  assert.deepEqual(portfolioUI.holdingPayload(new hf.FormData(hf.document.querySelector('form'))), {action: 'holdingSave', code: '600519', name: '', shares: '100', cost: '1500', stopPrice: '', note: ''});
  // mounting
  const w = new JSDOM(`<body>${box}</body>`).window, calls = [];
  const call = async p => { calls.push(p.action); return {result: p.action === 'overview' ? o : p.action === 'risk' ? {metrics: null} : {results: [], total: 0}}; };
  portfolioUI.mountPortfolio(w.document, call, {view: () => h.svc.view()});
  await new Promise(r => setTimeout(r, 0));
  assert.match(w.document.querySelector('.pf-body').innerHTML, /总资产/);
  w.document.querySelector('[data-pf="risk"]').click(); await new Promise(r => setTimeout(r, 0));
  assert.match(w.document.querySelector('.pf-body').innerHTML, /不足 20 个交易日/);
  w.document.querySelector('[data-pf="rules"]').click(); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(calls, ['overview', 'risk'], 'the 风控 tab reuses the cached overview');
  w.document.body.innerHTML = box; portfolioUI.mountPortfolio(w.document, call, {view: () => h.svc.view()}); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(calls, ['overview', 'risk'], 're-render reuses the cache');
  portfolioUI.invalidatePortfolio(w.document); w.document.body.innerHTML = box; portfolioUI.mountPortfolio(w.document, call); await new Promise(r => setTimeout(r, 0));
  assert.equal(calls.length, 3);
  const bad = new JSDOM(`<body>${box}</body>`).window;
  portfolioUI.mountPortfolio(bad.document, async () => { throw new Error("Error invoking remote method 'actwill:portfolio': Error: fetch failed"); }); await new Promise(r => setTimeout(r, 0));
  assert.match(bad.document.querySelector('.pf-body').innerHTML, /行情服务暂时连不上/);
});

test('feed and wiring', async () => {
  const items = buildFeed({activity: [{id: 'x', title: '风控提醒', code: '600438', detail: '通威股份（600438）亏损 30%，触及止损线 -8%', time: 1}]});
  const it = items.find(i => i.id === 'log:x');
  assert.deepEqual(it.actions, [{label: '查看详情', action: 'quantOpen', id: '600438'}]);
  const main = await readFile(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /createPortfolioService\(\{ store, quant, market, knowledge, research/);
  assert.match(main, /register\('portfolio'/);
  assert.match(main, /portfolio\?\.tick\(\)/);
  assert.match(main, /knowledge:_knowledge,portfolio:_portfolio,quant:_quant,\.\.\.publicData/);
  assert.match(main, /portfolio: portfolio\?\.view\(\)\|\|null/);
  assert.match(main, /get portfolio\(\) \{ return portfolio; \}/);
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /portfolioUI\.mountPortfolio\(document/);
  assert.match(app, /\/\^pf\[A-Z\]\/\.test\(actionId\)/);
  for (const a of ['pfHoldingNew', 'pfHoldingEdit', 'pfHoldingRemove', 'pfCash', 'pfRules', 'pfStop', 'pfCheck', 'pfClearAlerts', 'pfScenario', 'pfSimulate', 'pfReport']) assert.ok(app.includes(`'${a}'`), a);
  const quant = await readFile(new URL('../src/ui/quant.js', import.meta.url), 'utf8');
  assert.match(quant, /\$\{holdingsBox\(q, \{action\}\)\}\$\{portfolioBox\(state\.portfolio, \{action\}\)\}/);
  const rs = await readFile(new URL('../services/research.mjs', import.meta.url), 'utf8');
  assert.match(rs, /nav: '附图：组合市值与回撤/);
});
