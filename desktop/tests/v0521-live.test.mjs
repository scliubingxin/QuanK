// [v0.52.1] Per-second prices (Tencent quotes, live action, in-place patch), index tiles when Eastmoney refuses,
// faster price alerts, 1-minute signal watch, backtest header uses total assets, sync + restart and auto sync on start.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, utimes, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { parseTxQuotes, txOfSecid, createMarketService } from '../services/market.mjs';
import { patchLive } from '../src/ui/market.js';
import { WATCH_INTERVALS, parseWatch } from '../src/shared/quant.js';

const TX = `v_sh000001="1~上证指数~000001~3350.12~3340.00~3345.00~300000000~0~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~~20261123100001~10.12~0.30~3360.00~3330.00~3350.12/300000000/420000000000~300000000~42000000~0.80~15.00~";
v_sz399001="51~深证成指~399001~10500.50~10600.00~10580.00~1~0~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~~20261123100001~-99.50~-0.94~10620.00~10480.00~10500.50/1/500000000000~1~1~1~1~";
v_sz000001="51~平安银行~000001~12.34~12.00~12.10~1~0~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~~20261123100001~0.34~2.83~12.40~12.05~12.34/1/1234~1~1~1~1~";
v_sh600438="1~通威股份~600438~11.11~11.39~11.30~1~0~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~~20261123100001~-0.28~-2.46~11.40~11.05~11.11/100/111100~1~1~0.5~1~";`;

test('Tencent quote lines: fields, amount in yuan, symbols for indices / Shanghai / Shenzhen / Beijing', () => {
  const l = parseTxQuotes(TX);
  assert.equal(l.length, 4);
  assert.deepEqual([l[0].sym, l[0].market, l[0].code, l[0].price, l[0].pct, l[0].change, l[0].amount, l[0].preClose], ['sh000001', 1, '000001', 3350.12, 0.3, 10.12, 420000000000, 3340]);
  assert.deepEqual([l[3].name, l[3].price, l[3].pct, l[3].high, l[3].low], ['通威股份', 11.11, -2.46, 11.4, 11.05]);
  assert.deepEqual(['1.000001', '0.399001', '1.600438', '0.000001', '1.920001', '0.430017'].map(txOfSecid), ['sh000001', 'sz399001', 'sh600438', 'sz000001', 'bj920001', 'bj430017']);
  assert.deepEqual(parseTxQuotes('v_sh600000="";v_pv_none_match="1";'), []);
});

function svc({eastmoney = 'refuse', tx = TX} = {}) {
  const calls = [];
  let t = Date.UTC(2026, 10, 23, 2, 0); // Mon 10:00 CST
  const fetcher = async url => {
    calls.push(String(url));
    if (/qt\.gtimg\.cn/.test(url)) return {ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(tx).buffer, text: async () => tx};
    if (eastmoney === 'refuse') return {ok: false, status: 502, text: async () => ''};
    return {ok: true, status: 200, text: async () => JSON.stringify({rc: 0, data: {diff: []}})};
  };
  const alerts = [];
  const store = {data: {quant: {pool: [{code: '600438', name: '通威股份'}]}, market: {alerts: [{id: 'a1', code: '600438', kind: 'below', value: 11.2, name: '通威股份'}]}}, async save() {}};
  const s = createMarketService({store, fetcher, now: () => t, onAlert: a => alerts.push(a)});
  return {s, calls, alerts, store, adv: ms => { t += ms; }};
}

test('live: indices + visible codes from Tencent in one request, 0.8 s cache, Ping An is not the SSE index, alerts fire', async () => {
  const h = svc();
  const r = await h.s.handle({action: 'live', codes: ['600438', '000001']});
  assert.equal(r.session, 'open');
  assert.deepEqual(r.indices.map(x => [x.secid, x.price]), [['1.000001', 3350.12], ['0.399001', 10500.5]]);
  assert.deepEqual(Object.keys(r.quotes).sort(), ['000001', '600438']);
  assert.equal(r.quotes['000001'].price, 12.34, 'the stock 000001, not the index');
  assert.equal(h.calls.filter(u => /gtimg/.test(u)).length, 1);
  assert.match(h.calls[0], /q=sh000001,sz399001,sz399006,sh000300,sh000688,sh600438,sz000001$/);
  await h.s.handle({action: 'live', codes: ['600438']}); // different url -> new request; same url within 0.8 s is cached
  const n = h.calls.length; await h.s.handle({action: 'live', codes: ['600438']}); assert.equal(h.calls.length, n);
  h.adv(900); await h.s.handle({action: 'live', codes: ['600438']}); assert.equal(h.calls.length, n + 1);
  assert.equal(h.alerts.length, 1); assert.match(h.alerts[0].detail, /现价 11.11/);
  assert.equal(h.store.data.market.quotes['600438'].price, 11.11, 'pool quotes kept for the cards');
});

test('overview: index tiles filled from Tencent when Eastmoney refuses; the refusing host is skipped for a minute', async () => {
  const h = svc();
  const o = await h.s.handle({action: 'overview'});
  const sh = o.indices.find(x => x.secid === '1.000001');
  assert.equal(sh.price, 3350.12); assert.equal(sh.pct, 0.3);
  const before = h.calls.filter(u => /ulist\.np/.test(u)).length;
  h.adv(30e3); await h.s.handle({action: 'quotes', codes: ['600438']});
  assert.equal(h.calls.filter(u => /ulist\.np/.test(u)).length, before, 'no new ulist request while it is marked down');
  h.adv(61e3); await h.s.handle({action: 'quotes', codes: ['600519']}).catch(() => {});
  assert.ok(h.calls.filter(u => /ulist\.np/.test(u)).length > before, 'retried after a minute');
});

test('patchLive updates index tiles and prices in place', () => {
  const w = new JSDOM(`<button class="mk-idx mk-down" data-live-idx="1.000001"><small>上证指数</small><b>—</b><span>—</span></button>
<div class="card"><span data-live-tone class="down"><b data-live-pct="600438">-2.46%</b></span><b data-live-price="600438">11.11</b></div>`).window;
  const n = patchLive(w.document, {indices: [{secid: '1.000001', price: 3350.12, change: 10.12, pct: 0.3}], quotes: {'600438': {price: 11.25, pct: 1.2}}});
  assert.equal(n, 3);
  const tile = w.document.querySelector('[data-live-idx]');
  assert.equal(tile.querySelector('b').textContent, '3350.12'); assert.match(tile.querySelector('span').textContent, /\+10\.12 \+0\.3/); assert.ok(tile.classList.contains('mk-up'));
  assert.equal(w.document.querySelector('[data-live-price]').textContent, '11.25');
  assert.equal(w.document.querySelector('[data-live-pct]').textContent, '+1.20%'); assert.ok(w.document.querySelector('[data-live-tone]').classList.contains('up'));
});

test('signal watch can run every minute; wiring for live refresh, alerts every 3 s and backtest fixes', async () => {
  assert.deepEqual(WATCH_INTERVALS, [1, 2, 5, 10, 15, 30, 60]);
  assert.equal(parseWatch({interval: 1}).interval, 1);
  assert.throws(() => parseWatch({interval: 3}), /1 \/ 2 \/ 5/);
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  const [app, main, market, quantUi, mui, engine] = await Promise.all(['../src/app.js', '../main.mjs', '../services/market.mjs', '../src/ui/quant.js', '../src/ui/market.js', '../services/quant-engine.mjs'].map(read));
  assert.match(app, /setInterval\(\(\) => \{ liveTick\(\); \}, 1000\)/); assert.match(app, /action: 'live', codes/); assert.match(app, /\['open', 'pre'\]\.includes\(marketSession/);
  assert.match(app, /actionId === 'quantSyncRestart'/);
  assert.match(main, /'watch', 'live'\]\.includes\(p\?\.action\) \? \{ result \}/, 'live replies carry no full state');
  assert.match(market, /now\(\) - lastTick < 3e3/);
  assert.match(quantUi, /data-live-price="\$\{escape\(s\.code\)\}"/); assert.match(quantUi, /data-live-price="\$\{escape\(code\)\}"/);
  assert.match(mui, /data-live-idx="\$\{escape\(x\.secid \|\| ''\)\}"/); assert.match(mui, /交易时段指数和价格每秒刷新/);
  assert.match(quantUi, /pct\(off \? Number\(bt\.smartPct\) : last\.a\)/, 'header shows the total-asset return when the curve has no cash');
  assert.match(quantUi, /data-action="quantSyncRestart"/); assert.match(quantUi, /定投频率：/);
  assert.match(engine, /if \(a === 'syncRestart'\)/); assert.match(engine, /else if \(await sourceChanged\(\)\)/);
});

test('quant engine: sourceChanged compares the project files with the last sync', async () => {
  const {createQuantEngine} = await import('../services/quant-engine.mjs');
  const dir = await mkdtemp(path.join(tmpdir(), 'qk-src-')), data = await mkdtemp(path.join(tmpdir(), 'qk-eng-'));
  await writeFile(path.join(dir, 'server.py'), 'print(1)\n');
  await writeFile(path.join(dir, 'wb-engine.json'), JSON.stringify({title: 't', engine: {entry: 'server.py'}}));
  const store = {data: {quant: {source: dir, lastSync: Date.now()}}, async save() {}};
  const q = createQuantEngine({dir: data, store});
  assert.equal(await q.sourceChanged(), false);
  const later = new Date(Date.now() + 60e3); await utimes(path.join(dir, 'server.py'), later, later);
  assert.equal(await q.sourceChanged(), true);
  store.data.quant.lastSync = 0; assert.equal(await q.sourceChanged(), false, 'never synced: not "changed"');
  void mkdir;
});

test('feed: only buy / sell points, order drafts, stop-loss and own price alerts are important; notifications follow', async () => {
  const {buildFeed, feedUnread} = await import('../src/shared/feed.js');
  const d = {chats: [{id: 'c1', name: '对话', finishedAt: 50, messages: [{role: 'assistant', content: 'ok'}]}], tasks: [], pendingApprovals: [],
    quant: {alerts: [{id: 'q1', kind: 'change', time: 10, code: '600438', from: 'HOLD', to: 'BUY'}, {id: 'q2', kind: 'change', time: 11, code: '600438', from: 'BUY', to: 'HOLD'}, {id: 'q3', kind: 'digest', time: 12, counts: {total: 1}}]},
    activity: [{id: 'a1', title: '行情提醒', detail: 'x', time: 13}, {id: 'a2', title: '自选股异动', detail: 'y', time: 14}, {id: 'a3', title: '风控提醒', detail: '止损', time: 15}, {id: 'a4', title: '公告提醒', detail: 'z', time: 16}, {id: 'a5', title: '委托单', detail: '买入 x，待你确认', time: 17}]};
  const imp = Object.fromEntries(buildFeed(d).map(x => [x.id, x.important]));
  assert.deepEqual(imp, {'log:a5': true, 'log:a4': false, 'log:a3': true, 'log:a2': false, 'log:a1': true, 'quant:q3': false, 'quant:q2': false, 'quant:q1': true, 'chat:c1:50': false});
  assert.equal(feedUnread(d), 4);
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  const [main, app] = await Promise.all(['../main.mjs', '../src/app.js'].map(read));
  assert.match(main, /if \(!chat\.taskId\) return; \/\/ \[v0\.52\.1\]/, 'no system notification when an ordinary conversation finishes');
  assert.match(main, /if \(a\.kind !== 'change' \|\| !\/\^\(BUY\|STRONG_BUY\|SELL\|STRONG_SELL\)\$\/i\.test/, 'quant notifications only for buy / sell points');
  assert.match(app, /feedFilter = 'important'/);
  assert.match(app, /filter\(a => a\?\.title === '行情提醒'\)/, 'automatic market moves no longer pop up');
});

test('[v0.52.2] 半自动委托 tab under 自动化; negative engine cash and drawdown sign', async () => {
  const {automationPage} = await import('../src/ui/automation.js');
  const {tradeUI} = await import('../src/ui/trade.js'); void tradeUI;
  const action = (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`;
  const st = {tasks: [], chats: [], trade: {settings: {mode: 'paper'}, usage: {}, paper: {}, broker: {}, orders: [], history: [], text: '模拟盘'}};
  const tabs = automationPage(st, {action, empty: () => '', tab: 'tasks'});
  assert.match(tabs, /data-action="taskTab" data-id="trade">半自动委托/);
  assert.match(automationPage(st, {action, empty: () => '', tab: 'trade'}), /id="tradeBox"/);
  assert.doesNotMatch(automationPage({tasks: [], chats: []}, {action, empty: () => '', tab: 'tasks'}), /半自动委托/);
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  const [q, app, main] = await Promise.all(['../src/ui/quant.js', '../src/app.js', '../main.mjs'].map(read));
  assert.match(q, /h\.cash < 0 \? '—' \+ `<em>已投入超出引擎预算/);
  assert.match(q, /pct\(-Math\.abs\(bt\.maxDrawdown\)\)/);
  assert.match(app, /actionId === 'tradeHome'\) \{ taskTab = 'trade'; await navigate\('tasks'\)/);
  assert.match(main, /page: 'tasks', tab: 'trade'/);
});
