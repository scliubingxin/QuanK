import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { summarizeHolding, holdingTotals, parseTrade, summarizePlan, planOptions, parsePlan, engineFeatures, lotSize, QUANT_INTENT, ADAPTER_FILE } from '../src/shared/quant.js';
import { createQuantEngine } from '../services/quant-engine.mjs';
import { quantPage, quantTradeForm, quantTradePayload, quantPlanForm, quantPlanPayload } from '../src/ui/quant.js';
import { executeAppTool, appToolDefinitions } from '../services/app-tools.mjs';

const CST = (d, h, m) => Date.UTC(2026, 10, d, h - 8, m);
// A made-up engine; QuanK learns the holdings / plan shape only from this adapter.
const ADAPTER = {engine: {entry: 'run.py', health: '/hz'}, auth: {path: '/auth', okPath: 'ok'},
  endpoints: {pool: '/list', signal: '/s/{code}', position: '/pos?c={code}', positionRecord: {path: '/rec', body: {c: '{code}', d: '{side}', px: '{price}', n: '{shares}', memo: '{note}', day: '{date}'}}, plan: '/plan', planSet: {path: '/plan/set', body: {k: '{type}', t: '{times}'}}},
  fields: {action: 'a', score: 's', price: 'p', poolList: 'rows', poolCode: 'c', poolName: 'n'},
  holdings: {shares: 'h.n', cost: 'h.c', cash: 'h.m', trades: 'h.k', budget: 'b', log: {path: 'log', date: 'd', time: 'tm', side: 'sd', price: 'px', shares: 'q', amount: 'amt', note: 'nt'}, sides: {buy: 'BUY', sell: 'SELL'}, lot: 100},
  planFields: {label: 'cfg.lbl', type: 'cfg.k', times: 'cfg.t', maxMultiplier: 'cfg.mx'},
  planOptions: [{type: 'd', label: '每天', min: 1, max: 5}, {type: 'w', label: '每周', min: 1, max: 3}, {type: 'bad type', label: 'x', min: 1, max: 2}, {type: 'm', min: 0, max: 3}]};

test('helpers: holding summary, totals, trade / plan validation, features', () => {
  const raw = {h: {n: 1000, c: 10, m: 5000, k: 2}, b: 500, log: [{d: '2026-11-19', tm: '10:01:02', sd: 'SELL', px: 11, q: 100, amt: 1100, nt: '<i>x</i>'}, {d: '2026-11-18', sd: 'BUY', px: 9.5, q: 200}]};
  const h = summarizeHolding(ADAPTER, '600001', raw, 12);
  assert.deepEqual([h.shares, h.cost, h.cash, h.trades, h.budget, h.value, h.pnl, h.pnlPct], [1000, 10, 5000, 2, 500, 12000, 2000, 20]);
  assert.deepEqual(h.log.map(e => [e.side, e.price, e.shares]), [['sell', 11, 100], ['buy', 9.5, 200]]); assert.equal(h.log[0].note, '<i>x</i>');
  assert.equal(summarizeHolding(ADAPTER, '600001', raw).value, null, 'no price, no value');
  assert.equal(summarizeHolding({}, '600001', {}).shares, 0);
  assert.deepEqual(holdingTotals([h, {code: 'x', error: 'e'}, {...h, shares: 0}, {...h, value: 1000, pnl: -500}]), {stocks: 2, value: 13000, pnl: 1500, cost: 20000});
  assert.equal(holdingTotals([{...h, value: null}]).value, null);
  const ok = parseTrade(ADAPTER, {code: 'sh600001', side: 'buy', price: '10.1234', shares: '200', note: ' n '}, null, '2026-11-20');
  assert.deepEqual(ok, {code: '600001', side: 'buy', price: 10.123, shares: 200, date: '2026-11-20', note: 'n'});
  for (const [p, re] of [[{side: 'x'}, /买入或卖出/], [{side: 'buy', price: 0}, /成交价/], [{side: 'buy', price: 1, shares: 1.5}, /正整数/], [{side: 'buy', price: 1, shares: 150}, /100 的整数倍/],
    [{side: 'sell', price: 1, shares: 1100}, /超过当前持仓 1000 股/], [{side: 'buy', price: 1, shares: 100, date: '20261119'}, /YYYY-MM-DD/], [{side: 'buy', price: 1, shares: 100, date: '2026-11-21'}, /未来/]])
    assert.throws(() => parseTrade(ADAPTER, {code: '600001', ...p}, {shares: 1000}, '2026-11-20'), re);
  assert.throws(() => parseTrade(ADAPTER, {code: 'abc', side: 'buy', price: 1, shares: 100}), /6 位/);
  assert.equal(lotSize({}), 1); assert.equal(parseTrade(null, {code: '600001', side: 'buy', price: 1, shares: 7}).shares, 7);
  assert.deepEqual(summarizePlan(ADAPTER, {cfg: {lbl: '每周2次', k: 'w', t: 2, mx: 2}}), {label: '每周2次', type: 'w', times: 2, maxMultiplier: 2});
  const opts = planOptions(ADAPTER);
  assert.deepEqual(opts.map(o => o.type), ['d', 'w'], 'invalid options dropped');
  assert.deepEqual(parsePlan(opts, {type: 'w', times: '3'}), {type: 'w', times: 3});
  assert.throws(() => parsePlan(opts, {type: 'm', times: 1}), /每天 \/ 每周/); assert.throws(() => parsePlan(opts, {type: 'w', times: 4}), /每周次数需要在 1–3 之间/);
  assert.deepEqual(engineFeatures(ADAPTER), {holdings: true, record: true, plan: true, planSet: true, lot: 100});
  assert.deepEqual(engineFeatures(null), {holdings: false, record: false, plan: false, planSet: false, lot: 1});
  assert.ok(QUANT_INTENT.test('帮我记录一笔买入'));
});

async function fixture(adapter = ADAPTER) {
  const root = await mkdtemp(path.join(tmpdir(), 'wbq4-')), src = path.join(root, 'src');
  await mkdir(src, {recursive: true});
  await writeFile(path.join(src, 'run.py'), 'x'); await writeFile(path.join(src, ADAPTER_FILE), JSON.stringify(adapter));
  const pos = {n: 1000, c: 10, m: 5000, k: 0}, log = [], plan = {lbl: '每天1次', k: 'd', t: 1, mx: 2}, calls = [], logs = [];
  const json = (b, h = {}) => new Response(JSON.stringify(b), {status: 200, headers: {'content-type': 'application/json', ...h}});
  const fetcher = async (url, o = {}) => {
    const u = new URL(url), body = o.body ? JSON.parse(o.body) : undefined; calls.push({path: u.pathname + u.search, method: o.method || 'GET', body});
    if (u.pathname === '/hz') return json({});
    if (u.pathname === '/auth') return json({ok: true}, {'set-cookie': 'sid=1; Path=/'});
    if (u.pathname === '/list') return json({rows: [{c: '600001', n: '示例一'}, {c: '600002', n: '示例二'}]});
    if (/^\/s\/\d{6}$/.test(u.pathname)) return json({a: 'BUY', s: 70, p: 12});
    if (u.pathname === '/pos') return json(u.searchParams.get('c') === '600001' ? {h: pos, b: 500, log: [...log].reverse()} : {h: {n: 0, c: 0, m: 0, k: 0}, log: []});
    if (u.pathname === '/rec') { pos.n += body.d === 'BUY' ? body.n : -body.n; pos.k++; log.push({d: body.day, sd: body.d, px: body.px, q: body.n, amt: body.px * body.n, nt: body.memo}); return json({ok: true}); }
    if (u.pathname === '/plan') return json({cfg: plan});
    if (u.pathname === '/plan/set') { plan.k = body.k; plan.t = body.t; plan.lbl = (body.k === 'w' ? '每周' : '每天') + body.t + '次'; return json({ok: true}); }
    return new Response('{}', {status: 404});
  };
  const spawn = () => { const c = new EventEmitter(); c.kill = () => setTimeout(() => c.emit('exit', 0), 1); return c; };
  const store = {data: {}, save() {}, log: (t, d) => logs.push([t, d])};
  const engine = createQuantEngine({dir: path.join(root, 'ud'), store, spawn, fetcher, probe: () => ({ok: true}), port: async () => 18300, now: () => CST(20, 10, 0), exists: p => p.endsWith('python3') || existsSync(p)});
  await engine.sync({source: src}); await engine.start(); await engine.handle({action: 'pool'});
  return {engine, store, calls, logs, pos, count: p => calls.filter(c => c.path.startsWith(p)).length, cleanup: async () => { await engine.stop(); await rm(root, {recursive: true, force: true}); }};
}

test('engine: holdings, recording trades, plan, features and cache invalidation', async () => {
  const f = await fixture();
  try {
    const v = f.engine.view();
    assert.deepEqual(v.features, {holdings: true, record: true, plan: true, planSet: true, lot: 100}); assert.deepEqual(v.planOptions.map(o => o.type), ['d', 'w']);
    const s = await f.engine.handle({action: 'signal', code: '600001'});
    assert.equal(s.holding.shares, 1000); assert.equal(s.holding.value, 12000, 'valued at the signal price'); assert.equal(s.holding.pnlPct, 20);
    const all = await f.engine.handle({action: 'holdings'});
    assert.deepEqual(all.holdings.map(h => [h.code, h.shares]), [['600001', 1000], ['600002', 0]]); assert.equal(all.totals.stocks, 1);
    assert.equal(f.engine.view().holdings['600001'].shares, 1000);
    const r = await f.engine.handle({action: 'record', code: '600001', side: 'buy', price: 10.5, shares: 200});
    assert.deepEqual(f.calls.find(c => c.path === '/rec').body, {c: '600001', d: 'BUY', px: 10.5, n: 200, memo: '', day: '2026-11-20'});
    assert.equal(r.holding.shares, 1200); assert.equal(r.holding.log[0].side, 'buy'); assert.deepEqual(f.logs.at(-1), ['已记录买入', '600001 200 股 @ 10.5 · 2026-11-20']);
    const sig0 = f.count('/s/600001');
    await f.engine.handle({action: 'signal', code: '600001'});
    assert.equal(f.count('/s/600001'), sig0 + 1, 'a recorded trade invalidates the cached signal');
    await assert.rejects(f.engine.handle({action: 'record', code: '600001', side: 'sell', price: 11, shares: 5000}), /超过当前持仓 1200 股/);
    await assert.rejects(f.engine.handle({action: 'record', code: '600001', side: 'buy', price: 11, shares: 100, date: '2026-11-21'}), /未来/);
    assert.equal(f.count('/rec'), 1, 'invalid trades never reach the engine');
    await f.engine.handle({action: 'record', code: '600001', side: 'sell', price: 11, shares: 200, note: '止盈'});
    assert.equal(f.calls.filter(c => c.path === '/rec').at(-1).body.d, 'SELL'); assert.equal(f.pos.n, 1000);
    const pl = await f.engine.handle({action: 'plan'});
    assert.equal(pl.plan.label, '每天1次'); assert.equal(f.engine.view().plan.label, '每天1次');
    await assert.rejects(f.engine.handle({action: 'planSet', type: 'w', times: 9}), /1–3/); assert.equal(f.count('/plan/set'), 0);
    const sig1 = f.count('/s/600001');
    const ps = await f.engine.handle({action: 'planSet', type: 'w', times: 2});
    assert.deepEqual(f.calls.find(c => c.path === '/plan/set').body, {k: 'w', t: 2}); assert.equal(ps.plan.label, '每周2次'); assert.equal(f.logs.at(-1)[0], '已修改定投计划');
    await f.engine.handle({action: 'signal', code: '600001'}); assert.equal(f.count('/s/600001'), sig1 + 1, 'plan change clears cached signals');
  } finally { await f.cleanup(); }
  const g = await fixture({...ADAPTER, endpoints: {pool: '/list', signal: '/s/{code}'}});
  try {
    assert.equal(g.engine.view().features.holdings, false);
    await assert.rejects(g.engine.handle({action: 'holding', code: '600001'}), /没有提供持仓/);
    await assert.rejects(g.engine.handle({action: 'record', code: '600001', side: 'buy', price: 1, shares: 100}), /记录成交/);
    await assert.rejects(g.engine.handle({action: 'plan'}), /定投计划/);
    assert.equal((await g.engine.handle({action: 'signal', code: '600001'})).holding, null);
  } finally { await g.cleanup(); }
});

test('page: holdings table, card line, detail box, forms', () => {
  const action = (l, a, id = '', c = 'secondary') => `<button class="${c}" data-action="${a}" data-id="${id}">${l}</button>`;
  const heading = (k, t) => `<h1>${t}</h1>`, empty = t => t, date = () => '今天';
  const h1 = summarizeHolding(ADAPTER, '600001', {h: {n: 1000, c: 10, m: 5000, k: 1}, log: [{d: '2026-11-19', sd: 'BUY', px: 9.5, q: 200, nt: '<b>n</b>'}]}, 12);
  const q = {status: 'running', installed: true, source: '/s', features: engineFeatures(ADAPTER), planOptions: planOptions(ADAPTER), plan: {label: '每天1次', type: 'd', times: 1},
    pool: [{code: '600001', name: '示例一', last: {action: 'BUY', score: 70, price: 12}}, {code: '600002', name: '示例二'}], holdings: {'600001': h1, '600002': summarizeHolding(ADAPTER, '600002', {h: {n: 0}})}};
  const doc = new JSDOM(quantPage({quant: q}, {action, heading, empty, date})).window.document;
  const rows = doc.querySelectorAll('.q-hold-table tbody tr');
  assert.equal(rows.length, 2); assert.match(rows[0].textContent, /示例一.*1,000.*12,000\.00.*2,000\.00/s);
  assert.match(doc.querySelector('.q-hold-table tfoot').textContent, /合计 1 只/);
  assert.ok(doc.querySelector('[data-action="quantHoldings"]') && doc.querySelector('.q-holdings [data-action="quantTrade"]') && doc.querySelector('[data-action="quantPlan"]'));
  assert.match(doc.querySelector('.q-holdings small').textContent, /定投计划：每天1次/);
  assert.deepEqual([...doc.querySelectorAll('.quant-stock .q-hold')].map(p => p.textContent), ['持仓 1,000 股 · 成本 10 · +20%', '未持仓']);
  const off = new JSDOM(quantPage({quant: {...q, features: engineFeatures(null)}}, {action, heading, empty, date})).window.document;
  assert.equal(off.querySelector('.q-holdings'), null); assert.equal(off.querySelector('[data-action="quantPlan"]'), null);
  const detail = {summary: {code: '600001', action: 'BUY', reasons: [], gates: [], factors: [], indicators: [], backtest: {}}, charts: {ops: []}, holding: h1};
  const d = new JSDOM(quantPage({quant: q}, {action, heading, empty, date, open: '600001', detail})).window.document;
  assert.match(d.querySelector('.q-holding h2').textContent, /我的持仓/);
  assert.deepEqual([...d.querySelectorAll('.q-holding [data-action="quantTrade"]')].map(b => b.dataset.id), ['600001:buy', '600001:sell']);
  assert.match(d.querySelector('.q-holding tbody').textContent, /买入.*<b>n<\/b>/s);
  const form = new JSDOM(`<form>${quantTradeForm(q, {code: '600001', side: 'sell', price: 12, today: '2026-11-20'})}</form>`).window.document.querySelector('form');
  const fv = n => form.querySelector(`[name=${n}]`); // jsdom has no named-property access on forms
  assert.deepEqual([fv('code').value, fv('side').value, fv('price').value, fv('date').value, fv('shares').getAttribute('step')], ['600001', 'sell', '12', '2026-11-20', '100']);
  const fd = o => { const x = new FormData(); for (const [k, v] of Object.entries(o)) x.append(k, v); return x; };
  assert.deepEqual(quantTradePayload(fd({code: '600001', side: 'sell', price: '12.5', shares: '300', date: '2026-11-20', note: ' a '})), {action: 'record', code: '600001', side: 'sell', price: 12.5, shares: 300, date: '2026-11-20', note: 'a'});
  const pf = new JSDOM(`<form>${quantPlanForm(q)}</form>`).window.document.querySelector('form');
  assert.equal(pf.querySelector('[name=type]').value, 'd'); assert.equal(pf.querySelectorAll('option').length, 2);
  assert.deepEqual(quantPlanPayload(fd({type: 'w', times: '2'})), {action: 'planSet', type: 'w', times: 2});
});

test('app tools: holdings read-only, trades and plan changes need confirmation', async () => {
  const names = appToolDefinitions().map(d => d.function.name);
  for (const n of ['app_quant_holdings', 'app_quant_trade_record', 'app_quant_plan_set']) assert.ok(names.includes(n), n);
  const seen = [];
  const quant = {view: () => ({status: 'running', pool: [], planOptions: [{type: 'w', label: '每周', min: 1, max: 3}]}),
    handle: async p => { seen.push(p); if (p.action === 'holdings') return {holdings: [{code: '600001', shares: 100, log: [1, 2, 3, 4, 5, 6]}], totals: {stocks: 1}}; if (p.action === 'plan') return {plan: {label: '每天1次'}, options: [{type: 'd'}]};
      if (p.action === 'holding') return {code: p.code, shares: 100}; if (p.action === 'record') return {trade: p, holding: {shares: 300, log: [1, 2, 3, 4]}}; return {plan: {label: '每周2次'}}; }};
  const asks = [];
  const run = (name, args, answer = true) => executeAppTool(name, args, {store: {data: {}}, deps: {quant, notify() {}}, ask: async (t, d) => { asks.push([t, d]); return answer; }});
  const all = await run('app_quant_holdings', {});
  assert.equal(all.holdings[0].log.length, 5); assert.equal(all.plan.label, '每天1次'); assert.equal(asks.length, 0, 'reading never asks');
  assert.equal((await run('app_quant_holdings', {code: '600001'})).holding.shares, 100);
  await assert.rejects(run('app_quant_trade_record', {code: '600001', side: 'buy', price: 0, shares: 100}), /成交价/); assert.equal(asks.length, 0, 'invalid input rejected before asking');
  assert.equal((await run('app_quant_trade_record', {code: '600001', side: 'buy', price: 10, shares: 200}, false)).status, 'denied');
  assert.ok(!seen.some(p => p.action === 'record'));
  assert.match(asks.at(-1)[1], /600001 买入 200 股 @ 10（约 2000 元）[\s\S]*不会下单/);
  const r = await run('app_quant_trade_record', {code: '600001', side: 'buy', price: 10, shares: 200, note: 'n'});
  assert.equal(r.status, 'succeeded'); assert.equal(r.holding.log.length, 3); assert.deepEqual(seen.at(-1), {action: 'record', code: '600001', side: 'buy', price: 10, shares: 200, date: '', note: 'n'});
  assert.equal((await run('app_quant_plan_set', {type: 'w', times: 2}, false)).status, 'denied'); assert.match(asks.at(-1)[1], /每周 2 次/);
  assert.equal((await run('app_quant_plan_set', {type: 'w', times: 2})).plan.label, '每周2次');
});

test('wiring: renderer handlers and tool labels', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const a of ['quantTrade', 'quantHoldings', 'quantPlan']) assert.ok(app.includes(`'${a}'`), a);
  assert.match(app, /app_quant_trade_record: '记录成交'/);
});
