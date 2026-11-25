// [v0.52] 半自动委托: order sizing & limit price (M1), paper ledger, broker page scripts that fill but never click (M2),
// the service (signals -> drafts, caps, paper fills, real flow with a fake broker, fills -> holdings, expiry) (M2/M3/M4),
// chat tools, UI and wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as T from '../src/shared/trade.js';
import { createTradeService } from '../services/trade.mjs';
import { executeAppTool, appToolDefinitions, APP_INTENT } from '../services/app-tools.mjs';
import { tradeUI } from '../src/ui/trade.js';
import { buildFeed } from '../src/shared/feed.js';
import { auditOf } from '../services/audit.mjs';

const S0 = T.normalizeTradeSettings({});
const NOW = Date.UTC(2026, 10, 23, 2, 0); // Mon 2026-11-23 10:00 CST, trading hours
const Q = {price: 11.11, preClose: 11.0, name: '通威股份'};
const buy = (over = {}) => T.draftOrder({signal: {code: '600438', name: '通威股份', action: 'BUY', multiplier: 1.5, source: 'signal', ...over.signal}, quote: {...Q, ...over.quote}, settings: {...S0, ...over.settings}, used: over.used, cash: over.cash ?? null, summary: over.summary, rules: over.rules, now: NOW});
const sell = (have, over = {}) => T.draftOrder({signal: {code: '600438', name: '通威股份', action: 'SELL', source: 'signal', ...over.signal}, quote: {...Q, ...over.quote}, holding: {shares: have, cost: 13.5}, settings: {...S0, ...over.settings}, used: over.used, now: NOW});

test('defaults and settings: user choices, real trading needs an explicit confirmation', () => {
  assert.deepEqual([S0.mode, S0.baseAmount, S0.maxOrder, S0.maxDaily, S0.maxCount, S0.maxDeviation], ['paper', 5000, 20000, 50000, 5, 1.5]);
  assert.throws(() => T.parseTradeSettings({mode: 'real'}, S0), /确认风险提示/);
  assert.equal(T.parseTradeSettings({mode: 'real', confirmReal: true}, S0).mode, 'real');
  assert.equal(T.parseTradeSettings({mode: 'paper'}, {...S0, mode: 'real'}).mode, 'paper', 'back to paper needs no confirmation');
  assert.throws(() => T.parseTradeSettings({slippage: 2}, S0), /不能超过限价偏离上限/);
  assert.throws(() => T.parseTradeSettings({maxOrder: 60000}, S0), /单笔上限不能超过每日/);
  assert.throws(() => T.parseTradeSettings({maxCount: 0}, S0), /每日最多笔数/);
  assert.equal(T.parseTradeSettings({baseAmount: '8,000元'}, S0).baseAmount, 8000);
  assert.match(T.describeTradeSettings(S0), /模拟盘 · 每笔 5000 元 × 倍率 · 单笔 ≤ 20000 · 每日 ≤ 50000 \/ 5 笔/);
});

test('M1 limit price: slippage, price limits by board, deviation', () => {
  assert.deepEqual(T.limitPrice({side: 'buy', price: 11.11, preClose: 11, code: '600438'}), {price: 11.14, up: 12.1, down: 9.9, atLimit: false, deviation: 0.27});
  assert.equal(T.limitPrice({side: 'sell', price: 11.11, preClose: 11, code: '600438'}).price, 11.08);
  assert.equal(T.limitPrice({side: 'buy', price: 12.08, preClose: 11, code: '600438'}).price, 12.1, 'clamped to the limit-up price');
  assert.equal(T.limitPrice({side: 'buy', price: 12.1, preClose: 11, code: '600438'}).atLimit, true);
  assert.equal(T.limitPct('300750'), 20); assert.equal(T.limitPct('688981'), 20); assert.equal(T.limitPct('830799'), 30); assert.equal(T.limitPct('600000', '*ST 某某'), 5);
  assert.equal(T.minLot('688981'), 200); assert.equal(T.minLot('600438'), 100);
  assert.throws(() => T.limitPrice({side: 'buy', price: 0}), /没有现价/);
});

test('M1 buy sizing: base × multiplier, lots, caps by order / day / cash / position / industry', () => {
  let r = buy();
  assert.equal(r.ok, true);
  assert.deepEqual([r.order.side, r.order.shares, r.order.price, r.order.amount, r.order.status, r.order.key], ['buy', 600, 11.14, 6684, 'draft', '600438:buy:2026-11-23']);
  assert.equal(r.order.expiresAt, Date.parse('2026-11-23T15:00:00+08:00'));
  assert.ok(r.order.notes.includes('没有设置账户现金，未核对余额'));
  r = buy({signal: {multiplier: 5}}); assert.equal(r.order.shares, 1700); assert.ok(r.order.notes.some(n => /单笔上限 20000/.test(n)));
  r = buy({used: {buyAmount: 45000, count: 2}}); assert.equal(r.order.shares, 400); assert.ok(r.order.notes.some(n => /每日上限/.test(n)));
  r = buy({used: {buyAmount: 0, count: 5}}); assert.equal(r.ok, false); assert.match(r.reason, /达到每日最多 5 笔/); assert.equal(r.order.status, 'blocked');
  r = buy({cash: 3000}); assert.equal(r.order.shares, 200);
  r = buy({cash: 500}); assert.equal(r.ok, false); assert.match(r.reason, /可用现金/);
  const summary = {total: 100000, positions: [{code: '600438', value: 28000, industry: '电气设备'}], byIndustry: [{industry: '电气设备', value: 28000}]};
  r = buy({summary, rules: {maxPosition: 30, maxIndustry: 100}}); assert.equal(r.order.shares, 100); assert.ok(r.order.notes.some(n => /单股仓位上限 30%/.test(n)));
  r = buy({summary: {...summary, positions: [{code: '600438', value: 31000, industry: '电气设备'}]}, rules: {maxPosition: 30, maxIndustry: 100}}); assert.equal(r.ok, false); assert.match(r.reason, /单股仓位上限 30%/);
  r = buy({quote: {price: 12.1}}); assert.equal(r.ok, false); assert.match(r.reason, /涨停/);
  r = T.draftOrder({signal: {code: '688981', action: 'BUY', multiplier: 1}, quote: {price: 30, preClose: 30}, settings: S0, now: NOW}); assert.equal(r.ok, false); assert.match(r.reason, /200 股/);
  assert.equal(T.draftOrder({signal: {code: '600438', action: 'HOLD'}, quote: Q, settings: S0, now: NOW}).ok, false);
  r = buy({signal: {source: 'manual', price: 11.5}}); assert.equal(r.ok, false); assert.match(r.reason, /偏离现价/);
  r = buy({signal: {source: 'manual', price: 11.2, shares: 300}}); assert.deepEqual([r.order.shares, r.order.price], [300, 11.2]);
});

test('M1 sell sizing: half on SELL, all on STRONG_SELL / stop, odd lots, no holding', () => {
  assert.equal(sell(3000).order.shares, 1500);
  assert.equal(sell(3000).order.price, 11.08);
  assert.equal(sell(3050, {signal: {action: 'STRONG_SELL'}}).order.shares, 3050);
  assert.equal(sell(150).order.shares, 150, 'odd lot is sold whole');
  assert.equal(sell(1050).order.shares, 500);
  assert.equal(sell(1090).order.shares, 500);
  assert.equal(sell(190).order.shares, 190, 'never leave less than 100 shares behind');
  const st = sell(3000, {signal: {source: 'stop'}, used: {buyAmount: 50000, count: 9}});
  assert.equal(st.ok, true, 'stop-loss sells ignore the daily caps'); assert.equal(st.order.shares, 3000); assert.ok(st.order.notes.some(n => /止损卖出不受/.test(n)));
  assert.equal(sell(0).ok, false); assert.match(sell(0).reason, /没有持仓/);
  assert.ok(sell(3000, {quote: {price: 9.9}}).order.notes.includes('已跌停，可能卖不出'));
});

test('paper ledger: fills at the better price, cash and positions, guards', () => {
  const o = {id: 'o1', code: '600438', name: '通威股份', side: 'buy', price: 11.14, shares: 600};
  assert.equal(T.paperFill(o, {price: 11.2}), null);
  assert.deepEqual(T.paperFill(o, {price: 11.1}), {price: 11.1, shares: 600});
  let P = T.applyPaper(T.normalizePaper(null), o, {price: 11.1, shares: 600}, NOW);
  assert.deepEqual([P.cash, P.positions['600438'].shares, P.positions['600438'].cost, P.trades.length], [93340, 600, 11.1, 1]);
  P = T.applyPaper(P, {...o, price: 11.3}, {price: 11.3, shares: 400}, NOW);
  assert.equal(P.positions['600438'].cost, 11.18);
  assert.throws(() => T.applyPaper(P, {...o, side: 'sell'}, {price: 11, shares: 2000}), /持有 1000 股/);
  assert.throws(() => T.applyPaper(T.normalizePaper({cash: 100}), o, {price: 11, shares: 600}), /现金不足/);
  P = T.applyPaper(P, {...o, side: 'sell'}, {price: 12, shares: 1000}, NOW);
  assert.equal(P.positions['600438'], undefined);
  const s = T.paperSummary(P); assert.equal(s.total, s.cash); assert.equal(s.pnl, Math.round((s.total - 100000) * 100) / 100);
});

function brokerPage() {
  const dom = new JSDOM(`<body><form id="f"><input id="stockCode" placeholder="证券代码"><input name="entrustPrice"><input name="entrustAmount"><button id="buyBtn" type="submit">买入</button></form><table id="orders"><tr><td>600438 通威股份 买入 11.14 600 已成 600</td></tr><tr><td>600519 贵州茅台 买入 1450 100 已报</td></tr></table></body>`, {runScripts: 'outside-only', url: 'https://t.example-broker.com/trade'});
  const w = dom.window, ev = {input: 0, submit: 0, click: 0};
  w.document.querySelector('#stockCode').addEventListener('input', () => ev.input++);
  w.document.querySelector('#buyBtn').addEventListener('click', () => ev.click++);
  w.document.querySelector('#f').addEventListener('submit', e => { e.preventDefault(); ev.submit++; });
  return {w, ev};
}
test('M2 broker scripts: fill sets values with input events, outlines submit, never clicks or submits', async () => {
  const fields = {code: '#stockCode', price: 'input[name="entrustPrice"]', shares: 'input[name="entrustAmount"]', submit: '#buyBtn'};
  const src = T.fillScript({fields, values: {code: '600438', price: '11.14', shares: '600'}});
  assert.ok(!/\.click\(|\.submit\(|requestSubmit|MouseEvent|PointerEvent|KeyboardEvent|sendInputEvent/.test(src), 'no way to trigger an order in the fill script');
  const {w, ev} = brokerPage();
  const r = JSON.parse(JSON.stringify(w.eval(src)));
  assert.deepEqual(r.read, {code: '600438', price: '11.14', shares: '600'}); assert.deepEqual(r.missing, []); assert.equal(r.submitFound, true);
  assert.equal(ev.input, 1); assert.equal(ev.click, 0); assert.equal(ev.submit, 0);
  assert.match(w.document.querySelector('#buyBtn').style.outline, /3px solid/);
  assert.match(w.document.getElementById('__qk_tip').textContent, /由你自己点击红框里的按钮提交/);
  assert.deepEqual([...w.eval(T.fillScript({fields: {...fields, price: '#nope'}, values: {code: '1', price: '2', shares: '3'}})).missing], ['price']);
  const rows = JSON.parse(JSON.stringify(w.eval(T.readRowsScript('#orders', '600438'))));
  assert.deepEqual(rows, {found: true, rows: ['600438 通威股份 买入 11.14 600 已成 600']});
  assert.deepEqual(T.parseRow(rows.rows[0], {code: '600438', price: 11.14, shares: 600}), {status: 'filled', price: 11.14, shares: 600});
  assert.equal(T.parseRow('600438 买入 11.14 600 部分成交 300', {code: '600438', price: 11.14, shares: 600}).status, 'partial');
});

test('M2 calibration: the user clicks fields in turn; the page never receives those clicks', async () => {
  const {w, ev} = brokerPage();
  const steps = [['code', '代码'], ['price', '价格'], ['shares', '数量'], ['submit', '提交按钮']];
  const p = w.eval(T.calibrateScript(steps));
  const clickOn = el => { for (const t of ['pointerdown', 'mousedown', 'mouseup', 'click']) el.dispatchEvent(new w.MouseEvent(t, {bubbles: true, cancelable: true})); };
  clickOn(w.document.querySelector('#stockCode')); clickOn(w.document.querySelector('[name="entrustPrice"]')); clickOn(w.document.querySelector('[name="entrustAmount"]')); clickOn(w.document.querySelector('#buyBtn'));
  const r = await p;
  assert.equal(r.ok, true);
  assert.equal(r.fields.code, '#stockCode'); assert.equal(r.fields.price, 'input[name="entrustPrice"]'); assert.equal(r.fields.submit, '#buyBtn');
  assert.equal(ev.click, 0, 'the broker button never saw the calibration click'); assert.equal(ev.submit, 0);
  const p2 = w.eval(T.calibrateScript(steps)); w.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Escape'}));
  assert.equal((await p2).cancelled, true);
  const b = T.normalizeBroker({url: 'http://x', buy: {code: 'a;b{}', price: '#p'}});
  assert.equal(b.url, ''); assert.equal(b.buy.code, '', 'unsafe selector dropped'); assert.equal(b.buy.price, '#p');
  assert.equal(T.brokerReady({url: 'https://x.com', buy: {code: '#a', price: '#b', shares: '#c'}}, 'buy'), true);
  assert.equal(T.BROKER_PRESETS[0].url, 'https://t.cmschina.com/pch5/trade/ssologin/#/?t=jykstd');
});

function harness(over = {}) {
  let t = NOW, price = {...Q};
  const store = {data: {quant: {pool: [{code: '600438', name: '通威股份'}], alerts: [{id: 'old-1', kind: 'change', time: t - 3600e3, code: '600438', from: 'HOLD', to: 'BUY', multiplier: 1}], holdings: {'600438': {shares: 3000, cost: 13.5}}, features: {record: over.record !== false}},
    portfolio: {manual: [], alerts: [], rules: {maxPosition: 100, maxIndustry: 100}}, activity: []}, saves: 0, async save() { this.saves++; }};
  const market = {async handle(p) { if (p.action === 'quotes') return {quotes: p.codes.map(c => ({code: c, ...price}))}; if (p.action === 'resolve') return {code: '600438'}; throw new Error(p.action); }};
  const calls = [], alerts = [];
  const quant = {async handle(p) { calls.push(['quant', p]); return {}; }};
  const portfolio = {async handle(p) { calls.push(['portfolio', p]); return {}; }};
  const broker = {open: false, fills: [], async show(u) { this.open = true; this.url = u; return {open: true}; }, async navigate(u) { this.url = u; }, status() { return {open: this.open, url: 'https://t.cmschina.com/pch5/trade/buy'}; },
    read: null, async fill(F, v) { this.fills.push([F, v]); return this.read ? this.read(v) : {read: v, missing: [], submitFound: true}; }, async calibrate(steps) { return {ok: true, fields: Object.fromEntries(steps.map(([k]) => [k, '#' + k]))}; }, async readRows() { return {found: true, rows: ['600438 通威股份 买入 11.14 600 已成 600']}; }, async logout() { this.open = false; return {open: false}; }};
  const svc = createTradeService({store, market, quant, portfolio, broker, now: () => t, onAlert: a => alerts.push(a), tickMs: 15000});
  return {svc, store, calls, alerts, broker, adv: ms => { t += ms; }, set: v => { t = v; }, setPrice: p => { price = {...price, ...p}; }, push: a => store.data.quant.alerts.unshift({time: t, ...a})};
}

test('service: first look seeds, new signals become drafts once, stop-loss sells, notifications', async () => {
  const h = harness();
  await h.svc.tick();
  assert.equal(h.store.data.trade.orders.length, 0, 'existing alerts are only marked as seen');
  h.push({id: 'a1', kind: 'change', code: '600438', name: '通威股份', from: 'HOLD', to: 'BUY', toText: '买入', multiplier: 1.5, reason: '回撤到位'});
  h.adv(5000); await h.svc.tick(); assert.equal(h.store.data.trade.orders.length, 0, 'throttled to every 15 s');
  h.adv(11000); await h.svc.tick();
  const o = h.store.data.trade.orders[0];
  assert.deepEqual([o.side, o.shares, o.price, o.status, o.mode, o.source], ['buy', 600, 11.14, 'draft', 'paper', 'signal']);
  assert.match(o.reason, /HOLD → 买入：回撤到位/);
  assert.equal(h.alerts.length, 1); assert.match(h.alerts[0].title, /委托单 · 买入 通威股份/);
  assert.match(h.store.data.activity[0].detail, /待你确认/);
  h.push({id: 'a2', kind: 'change', code: '600438', from: 'BUY', to: 'STRONG_BUY', multiplier: 2}); h.adv(16000); await h.svc.tick();
  assert.equal(h.store.data.trade.orders.length, 1, 'one active order per stock and side per day');
  h.store.data.trade.paper.positions['600438'] = {shares: 2000, cost: 12, name: '通威股份'};
  h.store.data.portfolio.alerts.unshift({id: 'p1', kind: 'stopLoss', time: NOW + 40000, code: '600438', title: '通威股份亏损 17.7%，触及止损线 -8%'});
  h.adv(16000); await h.svc.tick();
  const s = h.store.data.trade.orders[0];
  assert.deepEqual([s.side, s.shares, s.source], ['sell', 2000, 'stop']);
  h.push({id: 'a3', kind: 'change', code: '600438', from: 'BUY', to: 'HOLD'}); h.adv(16000); await h.svc.tick();
  assert.equal(h.store.data.trade.orders.length, 2, 'HOLD makes no order');
  h.set(Date.UTC(2026, 10, 22, 2, 0)); // Sunday
  h.push({id: 'a4', kind: 'change', code: '600519', to: 'BUY'}); h.adv(16000); await h.svc.tick();
  assert.equal(h.store.data.trade.orders.length, 2, 'no drafts outside trading days');
});

test('service paper: confirm fills now or waits, caps rechecked, expiry at the close, pause', async () => {
  const h = harness();
  await h.svc.tick();
  const {order: o1} = await h.svc.handle({action: 'create', code: '600438', side: 'buy'});
  const r = await h.svc.handle({action: 'confirm', id: o1.id});
  assert.equal(r.filled, true); assert.equal(r.order.status, 'filled'); assert.equal(r.order.filledPrice, 11.11);
  assert.equal(r.order.shares, 400, 'manual order: base amount × 1');
  assert.equal(h.store.data.trade.paper.cash, Math.round((100000 - 11.11 * 400) * 100) / 100);
  await assert.rejects(h.svc.handle({action: 'confirm', id: o1.id}), /已成交，不能再下单/);
  const {order: o2} = await h.svc.handle({action: 'create', code: '600438', side: 'sell', shares: 300});
  h.setPrice({price: 11.0});
  const r2 = await h.svc.handle({action: 'confirm', id: o2.id});
  assert.equal(r2.filled, false); assert.equal(r2.order.status, 'open'); assert.match(r2.note, /模拟挂单中/);
  h.setPrice({price: 11.12}); h.adv(61000); await h.svc.tick();
  assert.equal(h.store.data.trade.orders.find(o => o.id === o2.id).status, 'filled');
  h.setPrice({price: 11.11});
  await h.svc.handle({action: 'settings', settings: {maxCount: 2}});
  await assert.rejects(h.svc.handle({action: 'create', code: '600519', side: 'buy'}), /达到每日最多 2 笔/);
  await h.svc.handle({action: 'settings', settings: {maxCount: 5}});
  const {order: o3} = await h.svc.handle({action: 'create', code: '600519', side: 'buy'});
  h.setPrice({price: 11.4});
  await assert.rejects(h.svc.handle({action: 'confirm', id: o3.id}), /相差超过 1.5%/);
  h.setPrice({price: 11.11});
  await h.svc.handle({action: 'settings', settings: {paused: true}});
  await assert.rejects(h.svc.handle({action: 'confirm', id: o3.id}), /已暂停/);
  await h.svc.handle({action: 'settings', settings: {paused: false}});
  h.set(Date.UTC(2026, 10, 23, 7, 1)); await h.svc.tick();
  assert.equal(h.store.data.trade.orders.find(o => o.id === o3.id).status, 'expired');
  const v = h.svc.view(); assert.equal(v.usage.count, 2); assert.ok(v.paper.total > 0); assert.equal(v.settings.mode, 'paper');
  await h.svc.handle({action: 'paperReset'}); assert.equal(h.store.data.trade.paper.cash, 100000);
});

test('service real: needs calibration, fills the broker page, checks read-back, user submits, fills recorded', async () => {
  const h = harness();
  await h.svc.tick();
  await assert.rejects(h.svc.handle({action: 'settings', settings: {mode: 'real'}}), /确认风险提示/);
  await h.svc.handle({action: 'settings', settings: {mode: 'real', confirmReal: true}});
  const {order} = await h.svc.handle({action: 'create', code: '600438', side: 'buy'});
  assert.equal(order.mode, 'real');
  await assert.rejects(h.svc.handle({action: 'confirm', id: order.id}), /还没有标注券商的买入页面/);
  await assert.rejects(h.svc.handle({action: 'calibrate', target: 'buy'}), /请先打开券商页面/);
  await h.svc.handle({action: 'brokerOpen'}); assert.equal(h.broker.url, 'https://t.cmschina.com/pch5/trade/ssologin/#/?t=jykstd');
  const cal = await h.svc.handle({action: 'calibrate', target: 'buy'});
  assert.deepEqual(cal.broker.buy, {code: '#code', price: '#price', shares: '#shares', submit: '#submit'}); assert.equal(cal.broker.buyUrl, 'https://t.cmschina.com/pch5/trade/buy');
  await h.svc.handle({action: 'calibrate', target: 'orders'});
  h.broker.read = v => ({read: {...v, shares: '60'}, missing: [], submitFound: true});
  await assert.rejects(h.svc.handle({action: 'confirm', id: order.id}), /不一致/);
  assert.equal(h.store.data.trade.orders[0].status, 'draft', 'mismatch: back to draft, nothing left half done');
  h.broker.read = () => ({read: {}, missing: ['price'], submitFound: false});
  await assert.rejects(h.svc.handle({action: 'confirm', id: order.id}), /找不到：委托价格输入框/);
  h.broker.read = null;
  const r = await h.svc.handle({action: 'confirm', id: order.id});
  assert.equal(r.order.status, 'awaiting'); assert.match(r.note, /由你自己点击提交/);
  assert.deepEqual(h.broker.fills.at(-1)[1], {code: '600438', price: '11.14', shares: '400'});
  await assert.rejects(h.svc.handle({action: 'report', id: order.id, status: 'done'}), /状态应为/);
  await h.svc.handle({action: 'report', id: order.id, status: 'submitted'});
  const rb = await h.svc.handle({action: 'readBack', id: order.id}); assert.equal(rb.hints[0].status, 'filled');
  await assert.rejects(h.svc.handle({action: 'report', id: order.id, status: 'filled', shares: 700}), /1–400 股/);
  const f = await h.svc.handle({action: 'report', id: order.id, status: 'partial', shares: 300, price: 11.12});
  assert.deepEqual([f.order.status, f.order.filledShares, f.recorded], ['partial', 300, 'engine']);
  assert.deepEqual(h.calls.at(-1), ['quant', {action: 'record', code: '600438', side: 'buy', price: 11.12, shares: 300, date: '2026-11-23', note: `QuankSight 委托单 ${order.id}`}]);
  const h2 = harness({record: false}); await h2.svc.tick();
  await h2.svc.handle({action: 'settings', settings: {mode: 'real', confirmReal: true}});
  h2.store.data.trade.broker = T.normalizeBroker({...T.BROKER_PRESETS[0], buy: {code: '#a', price: '#b', shares: '#c'}});
  h2.store.data.portfolio.manual = [{code: '600438', name: '通威股份', shares: 1000, cost: 12}];
  const {order: o2} = await h2.svc.handle({action: 'create', code: '600438', side: 'buy'});
  await h2.svc.handle({action: 'confirm', id: o2.id});
  await h2.svc.handle({action: 'report', id: o2.id, status: 'filled'});
  assert.deepEqual(h2.calls.at(-1), ['portfolio', {action: 'holdingSave', code: '600438', name: '通威股份', shares: 1400, cost: 11.7543, stopPrice: '', note: ''}]);
  const {order: o3} = await h2.svc.handle({action: 'create', code: '600519', side: 'buy'});
  await h2.svc.handle({action: 'confirm', id: o3.id});
  const c = await h2.svc.handle({action: 'cancel', id: o3.id}); assert.match(c.note, /在券商那边也撤单/);
  h2.set(Date.UTC(2026, 10, 23, 7, 30));
  const {order: o4} = {order: h2.store.data.trade.orders.find(o => o.status === 'filled')}; void o4;
  await h2.svc.handle({action: 'brokerLogout'}); assert.equal(h2.broker.open, false);
});

test('chat tools: list, create / confirm / fill / cancel need confirmation, settings read and write, intent', async () => {
  const names = appToolDefinitions().map(d => d.function.name).filter(n => n.startsWith('app_trade_'));
  assert.deepEqual(names, ['app_trade_orders', 'app_trade_order_create', 'app_trade_order_confirm', 'app_trade_order_fill', 'app_trade_order_cancel', 'app_trade_settings']);
  const h = harness(); await h.svc.tick();
  let yes = true;
  const market = {handle: async () => ({code: '600438'})};
  const run = (n, a) => executeAppTool(n, a, {store: h.store, deps: {trade: h.svc, market, notify() {}}, ask: async () => yes, chatId: 'c'});
  yes = false; assert.equal((await run('app_trade_order_create', {query: '通威', side: 'buy'})).status, 'denied'); assert.equal(h.store.data.trade.orders.length, 0);
  yes = true; const c = await run('app_trade_order_create', {query: '通威', side: 'buy'});
  assert.equal(c.order.side, '买入'); assert.equal(c.order.shares, 400);
  let l = await run('app_trade_orders', {}); assert.equal(l.mode, '模拟盘'); assert.equal(l.orders.length, 1); assert.match(l.note, /提交由用户在券商页面亲自完成/);
  const cf = await run('app_trade_order_confirm', {id: c.order.id}); assert.equal(cf.order.status, 'filled');
  assert.equal((await run('app_trade_settings', {})).settings.baseAmount, 5000);
  assert.match((await run('app_trade_settings', {baseAmount: 8000})).text, /每笔 8000 元/);
  assert.equal(appToolDefinitions().find(d => d.function.name === 'app_trade_settings').function.parameters.properties.mode, undefined, 'chat cannot switch to real trading');
  await assert.rejects(run('app_trade_order_cancel', {id: 'nope'}), /没有这张委托单/);
  for (const q of ['看看今天的委托单', '帮我下单', '撤单', '模拟盘赚了多少']) assert.ok(APP_INTENT.test(q), q);
});

test('UI, feed, audit and wiring', async () => {
  const h = harness(); await h.svc.tick();
  const {order} = await h.svc.handle({action: 'create', code: '600438', side: 'buy'});
  let html = tradeUI.tradeBox(h.svc.view());
  assert.match(html, /id="tradeBox"/); assert.match(html, /模拟盘/); assert.match(html, /data-action="tdConfirm" data-id="od-/); assert.match(html, />模拟下单</); assert.match(html, /今日买入额度/);
  await h.svc.handle({action: 'settings', settings: {mode: 'real', confirmReal: true}});
  html = tradeUI.tradeBox(h.svc.view());
  assert.match(html, /真实下单/); assert.match(html, /不会替你点击提交/);
  assert.match(tradeUI.REAL_RISK_HTML, /QuankSight 不会替你点击提交/); assert.match(tradeUI.REAL_RISK_HTML, /向券商报告/);
  const w = new JSDOM(`<form>${tradeUI.settingsForm(T.normalizeTradeSettings({}))}</form>`).window;
  const p = tradeUI.settingsPayload(new w.FormData(w.document.querySelector('form')));
  assert.deepEqual([p.settings.mode, p.settings.baseAmount, p.settings.maxDaily, p.settings.fromStops], ['paper', '5000', '50000', true]);
  assert.match(tradeUI.fillForm(order, [{row: '600438 买入 11.14 600 部分成交 300', status: 'partial', price: 11.14, shares: 300}]), /value="300"/);
  assert.match(tradeUI.brokerPanel({id: 'cmschina', url: T.BROKER_PRESETS[0].url, ready: {buy: true, sell: false}}, T.BROKER_PRESETS), /招商证券（网页版）[\s\S]*标注卖出页面/);
  const feed = buildFeed({activity: [{id: 'x', title: '委托单', detail: '买入 通威股份（600438）600 股 @ 11.14，约 6684 元，待你确认', time: 1}]});
  const it = feed.find(i => i.id === 'log:x'); assert.equal(it.needsAction, true); assert.deepEqual(it.actions, [{label: '查看委托单', action: 'tradeHome', id: ''}]); // [v0.52.2] under 自动化
  assert.equal(auditOf('trade', {action: 'view'}), null); assert.equal(auditOf('trade', {action: 'readBack'}), null);
  assert.equal(auditOf('trade', {action: 'confirm', id: 'od-1'}).kind, 'trade'); assert.equal(auditOf('trade', {action: 'settings'}).kind, 'rules'); assert.equal(auditOf('trade', {action: 'calibrate'}).kind, 'security');
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  const [main, preload, app, quant, broker] = await Promise.all(['../main.mjs', '../preload.cjs', '../src/app.js', '../src/ui/quant.js', '../services/broker.mjs'].map(read));
  assert.match(main, /createTradeService\(\{ store, quant, market, portfolio, broker: createBrokerBrowser\(\{ BrowserWindow \}\)/); assert.match(main, /register\('trade'/); assert.match(main, /trade\?\.tick\(\)/);
  assert.match(main, /miniapps:_miniapps,trade:_trade,research:_research/);
  assert.match(preload, /'security','trade'(,'dataset')?\]/);
  for (const a of ['tdConfirm', 'tdCancel', 'tdReport', 'tdFill', 'tdRead', 'tdCreate', 'tdPause', 'tdSettings', 'tdBroker', 'tdBrokerOpen', 'tdCalibrate', 'tdBrokerLogout']) assert.ok(app.includes(`'${a}'`), a);
  assert.match(app, /confirmReal: true/);
  assert.doesNotMatch(quant, /tradeBox\(/, '[v0.52.2] moved off the quant page');
  assert.match(broker, /partition: 'qk-broker'/); assert.ok(!/persist:/.test(broker), 'the broker login is never persisted');
  assert.ok(!/sendInputEvent|\.click\(/.test(broker), 'the broker window code never clicks');
});

test('version badge: main exposes appVersion, sidebar shows it', async () => {
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  const [main, app, css] = await Promise.all(['../main.mjs', '../src/app.js', '../src/workbench.css'].map(read));
  assert.match(main, /appVersion: app\.getVersion\(\)/);
  assert.match(app, /if \(next\?\.appVersion\) appVersion = String\(next\.appVersion\)/);
  assert.match(app, /class="brand-ver"[^`]*v\$\{escape\(appVersion\)\}/);
  assert.match(css, /\.brand \.brand-ver\{/);
});
