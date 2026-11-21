// [F1] 行情工作台：指标与图表、解析、行情服务（含提醒）、对话工具、界面与接线
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { secid, sma, ema, macd, kdj, klineSvg, trendSvg, heatColor, session, miniLine, bigNum, INDICES } from '../src/shared/market.js';
import { createMarketService, parseQuote, parseKlines, parseTrends, parsePool, listOf, val, limitPct } from '../services/market.mjs';
import { marketHomeCard, marketPage, klineBox, mountKlineBoxes, opsMarks, marketAlertPayload, sectorStocksView } from '../src/ui/market.js';
import { executeAppTool, appToolDefinitions, appToolContext, APP_PAGES } from '../services/app-tools.mjs';
import { quantPage } from '../src/ui/quant.js';
import { homeQuant } from '../src/ui/home-quant.js';
import { QUANT_INTENT } from '../src/shared/quant.js';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const OPEN = Date.UTC(2026, 10, 20, 2, 0), SAT = Date.UTC(2026, 10, 21, 2, 0); // Fri 10:00 / Sat 10:00 CST
const bars = n => Array.from({length: n}, (_, i) => { const c = 100 + Math.sin(i / 5) * 8 + i * 0.2; return {date: `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + i % 28).padStart(2, '0')}`, open: c - 1, close: c, high: c + 2, low: c - 3, volume: 1000 + i * 10, pct: 0.5}; });
const kRows = (n, cols = 11) => Array.from({length: n}, (_, i) => [`2026-11-${String(1 + i).padStart(2, '0')}`, 10 + i, 10.5 + i, 11 + i, 9.5 + i, 1000, 1e7, 2.1, 1.2, 0.2, 0.8].slice(0, cols).join(','));

test('indicators and charts', () => {
  assert.equal(secid('600519'), '1.600519'); assert.equal(secid('sz300750'), '0.300750'); assert.equal(secid('830799'), '0.830799'); assert.throws(() => secid('abc'));
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  assert.equal(ema([1, 1, 1], 3).at(-1), 1);
  const m = macd(bars(60).map(b => b.close)); assert.equal(m.bar.length, 60); assert.ok(Math.abs(m.bar.at(-1) - 2 * (m.dif.at(-1) - m.dea.at(-1))) < 1e-9);
  const k = kdj(bars(30)); assert.equal(k.k.length, 30); assert.ok(k.k.every(v => v >= 0 && v <= 100));
  const svg = klineSvg(bars(150), {last: 120, marks: [{date: bars(150)[149].date, type: 'buy'}]});
  assert.equal((svg.match(/class="mk-hit"/g) || []).length, 120); assert.match(svg, /MA5 /); assert.match(svg, /MACD\(12,26,9\)/); assert.match(svg, /mk-mark buy/);
  assert.match(klineSvg(bars(40), {sub: 'kdj'}), /KDJ\(9,3,3\)/);
  assert.match(klineSvg([]), /暂无 K 线数据/);
  assert.match(trendSvg([{time: '09:30', price: 10, avg: 10, volume: 5}, {time: '09:31', price: 10.2, avg: 10.1, volume: 3}], 10), /mk-trend/);
  assert.match(trendSvg([], 10), /暂无分时数据/);
  assert.notEqual(heatColor(5), heatColor(-5)); assert.equal(heatColor(0), '#eef1f6');
  assert.equal(session(OPEN), 'open'); assert.equal(session(SAT), 'closed'); assert.equal(session(Date.UTC(2026, 10, 20, 4, 0)), 'lunch');
  assert.match(miniLine([1, 2, 3]), /<svg/); assert.equal(bigNum(7.0257e11), '7025.70亿'); assert.equal(INDICES.length, 5);
});

test('parsers: quotes with "-", K lines with 11 or 7 columns, trends, limit pools', () => {
  assert.equal(val('-'), null); assert.equal(val('3.5'), 3.5);
  const q = parseQuote({f12: '000001', f13: 1, f14: '上证指数', f2: 3533.79, f3: -1.23, f4: -43.83, f104: 900, f105: 1300, f106: 50, f18: 3577.62});
  assert.deepEqual([q.code, q.price, q.pct, q.up, q.preClose], ['000001', 3533.79, -1.23, 900, 3577.62]);
  assert.equal(parseQuote({f12: '600000', f2: '-', f3: '-'}).price, null);
  assert.throws(() => listOf({rc: 102}), /rc=102/);
  const k = parseKlines({rc: 0, data: {code: '300750', name: '宁德时代', preKPrice: 9, klines: kRows(3)}});
  assert.equal(k.bars.length, 3); assert.equal(k.bars[0].turnover, 0.8); assert.equal(k.bars[2].close, 12.5);
  const k7 = parseKlines({rc: 0, data: {code: '000001', preKPrice: 10, klines: kRows(3, 7)}});
  assert.equal(k7.bars[0].pct, 5); assert.equal(k7.bars[1].pct, 9.52);
  const t = parseTrends({rc: 0, data: {code: '300750', preClose: 234.58, trends: ['2026-11-20 09:30,230.00,230.00,230.00,230.00,5569,128087000.00,230.000', '2026-11-20 09:31,230,231,231,230,10,1,230.4']}});
  assert.equal(t.points.length, 2); assert.equal(t.points[1].price, 231); assert.equal(t.points[1].avg, 230.4); assert.equal(t.preClose, 234.58);
  assert.deepEqual(parsePool({rc: 0, data: {tc: 28, qdate: 20261120, pool: [{}]}}), {total: 28, date: '20261120'});
  assert.equal(limitPct('300750'), 20); assert.equal(limitPct('600519'), 10); assert.equal(limitPct('600001', '*ST某某'), 5); assert.equal(limitPct('830799'), 30);
});

function fakeApi() {
  const calls = [];
  const idx = INDICES.map(([id, name], i) => ({f12: id.split('.')[1], f13: Number(id[0]), f14: name, f2: 3000 + i, f3: i % 2 ? 1.1 : -0.6, f4: 10, f6: 5e11, f104: 1000, f105: 800, f106: 40}));
  const routes = [
    [/ulist\.np.*secids=1\.000001/, () => ({rc: 0, data: {diff: idx}})],
    [/ulist\.np.*secids=/, url => ({rc: 0, data: {diff: decodeURIComponent(url).split('secids=')[1].split(',').map(s => { const c = s.split('.')[1]; return {f12: c, f13: Number(s[0]), f14: c === '300750' ? '宁德时代' : '贵州茅台', f2: c === '300750' ? 250 : 1500, f3: c === '300750' ? 20 : 1.2, f4: 5, f15: 251, f16: 230, f17: 231, f18: 208}; })}})],
    [/clist.*m:90\+t:2/, () => ({rc: 0, data: {diff: [{f12: 'BK1036', f14: '半导体', f2: 1000, f3: 3.2, f128: '华微电子', f140: '600360', f136: 10}, {f12: 'BK0475', f14: '银行', f3: -0.5}]}})],
    [/clist.*m:90\+t:3/, () => ({rc: 0, data: {diff: [{f12: 'BK1675', f14: '历史新高', f3: 0.87}]}})],
    [/clist.*fs=b:BK1036/, () => ({rc: 0, data: {diff: [{f12: '600360', f13: 1, f14: '华微电子', f2: 9.01, f3: 10.01}]}})],
    [/clist.*po=1.*fid=f3&fs=m:0/, () => ({rc: 0, data: {diff: [{f12: '920575', f13: 0, f14: '北交所股', f2: 5, f3: 30}, {f12: '301313', f13: 0, f14: '凡拓数创', f2: 59.16, f3: 20}]}})],
    [/clist.*po=0.*fid=f3&fs=m:0/, () => ({rc: 0, data: {diff: [{f12: '600001', f13: 1, f14: '某股', f2: 3, f3: -10}]}})],
    [/getTopicZTPool/, () => ({rc: 0, data: {tc: 28, qdate: 20261120}})],
    [/getTopicDTPool/, () => ({rc: 0, data: {tc: 58, qdate: 20261120}})],
    [/trends2/, () => ({rc: 0, data: {code: '000001', name: 'x', preClose: 100, trends: Array.from({length: 30}, (_, i) => `t${i},1,${100 + i},1,1,1,1,1`)}})],
    [/kline\/get/, () => ({rc: 0, data: {code: '300750', name: '宁德时代', preKPrice: 9, klines: kRows(26)}})],
  ];
  const fetcher = async url => { calls.push(url); for (const [re, f] of routes) if (re.test(url)) { const body = JSON.stringify(f(url)); return {ok: true, status: 200, text: async () => body}; } return {ok: false, status: 404, text: async () => ''}; };
  return {fetcher, calls};
}
const lookup = {find: async q => q === '宁德' ? [{code: '300750', name: '宁德时代', aShare: true, pinyin: 'NDSD'}] : q === '茅' ? [{code: '600519', name: '贵州茅台', aShare: true, pinyin: 'GZMT'}, {code: '600199', name: '金种子酒', aShare: true, pinyin: 'JZZJ'}] : [], logo: async () => ''};

test('service: overview, sector stocks by name, K-line summary, watch keeps the overview fresh', async () => {
  let t = OPEN; const store = {data: {}, save: async () => {}}, api = fakeApi(); let notified = 0;
  const m = createMarketService({store, fetcher: api.fetcher, lookup, now: () => t, notify: () => notified++});
  const o = await m.handle({action: 'overview'});
  assert.equal(o.indices.length, 5); assert.equal(o.indices[0].name, '上证指数'); assert.ok(o.indices[0].mini.length > 2);
  assert.deepEqual([o.breadth.up, o.breadth.down, o.breadth.limitUp, o.breadth.limitDown], [2000, 1600, 28, 58]);
  assert.deepEqual(o.gainers.map(g => g.code), ['301313'], 'Beijing exchange filtered'); assert.equal(o.industry[0].leader.name, '华微电子'); assert.equal(o.date, '2026-11-20');
  const ss = await m.handle({action: 'sectorStocks', sector: '半导体'}); assert.equal(ss.sector.code, 'BK1036'); assert.equal(ss.stocks[0].name, '华微电子');
  await assert.rejects(m.handle({action: 'sectorStocks', sector: '不存在的板块'}), /没有找到/);
  const k = await m.handle({action: 'kline', code: '300750', period: 'week', summary: true});
  assert.equal(k.period, '周K'); assert.equal(k.bars, 26); assert.ok(k.ma.ma20 !== null); assert.ok('dif' in k.macd); assert.equal(k.recent.length, 5);
  assert.match(api.calls.find(u => /kline\/get/.test(u)), /klt=102/);
  const intra = await m.handle({action: 'kline', code: '300750', period: 'intraday'}); assert.equal(intra.points.length, 30);
  assert.deepEqual(await m.handle({action: 'resolve', query: '宁德'}), {code: '300750', name: '宁德时代'});
  await assert.rejects(m.handle({action: 'resolve', query: '茅'}), e => e.choices?.length === 2);
  const before = api.calls.filter(u => /secids=1\.000001/.test(u)).length;
  await m.handle({action: 'watch'}); t += 11e3; await m.tick(); await new Promise(r => setTimeout(r, 20));
  assert.ok(api.calls.filter(u => /secids=1\.000001/.test(u)).length > before, 'overview refreshed while watched'); assert.ok(notified > 0);
  t = SAT; const n2 = api.calls.length; await m.tick(); assert.equal(api.calls.length, n2, 'no polling when the market is closed');
  assert.equal(m.view().overview.indices.length, 5);
});

test('service M3: watchlist quotes, alerts fire once a day, limit-up for pool stocks, only while trading', async () => {
  let t = OPEN; const alerts = [], api = fakeApi();
  const store = {data: {quant: {pool: [{code: '300750', name: '宁德时代'}, {code: '600519', name: '贵州茅台'}]}}, save: async () => {}};
  const m = createMarketService({store, fetcher: api.fetcher, lookup, now: () => t, onAlert: a => alerts.push(a)});
  const a1 = await m.handle({action: 'addAlert', code: '600519', name: '贵州茅台', kind: 'above', value: 1400});
  assert.match(a1.text, /贵州茅台 价格涨到 1400/);
  await assert.rejects(m.handle({action: 'addAlert', code: '600519', kind: 'x', value: 1}), /提醒类型/);
  await m.tick();
  assert.equal(store.data.market.quotes['300750'].price, 250);
  assert.deepEqual(alerts.map(a => a.title).sort(), ['自选股涨停', '行情提醒']);
  assert.ok(store.data.activity.some(x => /宁德时代（300750）涨停/.test(x.detail)));
  t += 16e3; await m.tick(); assert.equal(alerts.length, 2, 'once per day');
  t = SAT; const n = api.calls.length; await m.tick(); assert.equal(api.calls.length, n);
  const {removed} = await m.handle({action: 'removeAlert', id: a1.id}); assert.equal(removed, 1);
  assert.equal((await m.handle({action: 'settings', movePct: 3})).movePct, 3);
});

test('chat tools: overview, sectors, quote, K line opens the stock, alerts need confirmation', async () => {
  const seen = [], opened = [], asked = [];
  const market = {handle: async p => {
    seen.push(p);
    if (p.action === 'overview') return {date: '2026-11-20', session: 'closed', amount: 1e12, indices: [{name: '上证指数', price: 3533.79, pct: -1.23, change: -43.8, mini: [1, 2]}], breadth: {up: 900}, industry: [{name: '半导体', pct: 3.2, leader: {name: '华微电子', pct: 10}}], concept: [], gainers: [{code: '301313', name: '凡拓数创', price: 59.16, pct: 20}], losers: []};
    if (p.action === 'resolve') { if (p.query === '茅') { const e = new Error('多只'); e.choices = [{code: '600519', name: '贵州茅台'}]; throw e; } return {code: '300750', name: '宁德时代'}; }
    if (p.action === 'quotes') return {quotes: [{code: '300750', name: '宁德时代', price: 227.78, pct: -2.9}]};
    if (p.action === 'kline') return {code: '300750', name: '宁德时代', period: '周K', last: {close: 227.78}};
    if (p.action === 'sectors') return {kind: p.kind, sectors: [{name: '半导体', pct: 3.2}]};
    if (p.action === 'sectorStocks') return {sector: {name: '半导体'}, stocks: [{code: '600360', name: '华微电子', pct: 10}]};
    if (p.action === 'addAlert') return {id: 'a', text: '宁德时代 涨幅达到 5%'};
    return {};
  }, view: () => ({alerts: [{id: 'a', text: 't'}]})};
  const run = (name, args = {}, answer = true) => executeAppTool(name, args, {store: {data: {}}, deps: {market, openMarket: c => opened.push(c), notify() {}}, ask: async tt => { asked.push(tt); return answer; }});
  const ov = await run('app_market_overview'); assert.equal(ov.indices[0].name, '上证指数'); assert.equal(ov.topIndustry[0].leader, '华微电子'); assert.match(ov.note, /不构成投资建议/);
  assert.equal((await run('app_market_sectors', {kind: 'concept', order: 'down'})).sectors[0].name, '半导体'); assert.deepEqual(seen.at(-1), {action: 'sectors', kind: 'concept', order: 'down', limit: 10});
  assert.equal((await run('app_market_sector_stocks', {sector: '半导体'})).stocks[0].code, '600360');
  assert.equal((await run('app_market_quote', {query: '宁德时代'})).quotes[0].price, 227.78);
  assert.equal((await run('app_market_quote', {query: '茅'})).status, 'needs_choice');
  const k = await run('app_market_kline', {query: '宁德时代', period: 'week'}); assert.equal(k.kline.period, '周K'); assert.deepEqual(opened, ['300750']); assert.deepEqual(seen.at(-1), {action: 'kline', code: '300750', period: 'week', summary: true});
  assert.equal((await run('app_market_alert_add', {query: '宁德时代', kind: 'up', value: 5}, false)).status, 'denied'); assert.ok(!seen.some(p => p.action === 'addAlert'));
  const ok = await run('app_market_alert_add', {query: '宁德时代', kind: 'up', value: 5}); assert.equal(ok.alert.text, '宁德时代 涨幅达到 5%'); assert.match(asked.at(-1), /宁德时代（300750）涨幅达到 5%/);
  assert.equal((await run('app_market_alert_list')).alerts.length, 1);
  assert.equal((await run('app_market_alert_remove', {id: 'a'})).status, 'succeeded');
  const names = appToolDefinitions().map(d => d.function.name);
  for (const n of ['app_market_overview', 'app_market_sectors', 'app_market_sector_stocks', 'app_market_quote', 'app_market_kline', 'app_market_alert_add', 'app_market_alert_list', 'app_market_alert_remove']) assert.ok(names.includes(n), n);
  assert.match(appToolContext(), /app_market_/); assert.equal(APP_PAGES.market, '行情');
  for (const s of ['上证现在多少点', '今天哪个板块涨得最好', '给我看宁德时代的周 K 线', '半导体板块涨幅前十']) assert.ok(QUANT_INTENT.test(s), s);
});

test('UI: home card, 行情 page, stock view, K-line box mount, live prices on cards', async () => {
  const action = (l, id, x = '', cls = '') => `<button data-action="${id}" data-id="${x}" class="${cls}">${l}</button>`;
  const o = {at: 1, session: 'open', date: '2026-11-20', amount: 1.2e12, indices: INDICES.map(([id, name], i) => ({secid: id, name, price: 3000 + i, pct: i ? 1 : -1, change: 5, mini: [1, 2, 3]})), breadth: {up: 2000, down: 1600, flat: 80, limitUp: 28, limitDown: 58},
    gainers: [{code: '301313', name: '凡拓数创', price: 59.16, pct: 20, amount: 1.49e9}], losers: [{code: '600001', name: '某股', price: 3, pct: -10}], industry: [{code: 'BK1036', name: '半导体', pct: 3.2, leader: {name: '华微电子', pct: 10}}], concept: [{code: 'BK1675', name: '历史新高', pct: 0.87}]};
  const st = {market: {overview: o, alerts: [{id: 'a1', text: '宁德时代 涨幅达到 5%'}], quotes: {'300750': {price: 250, pct: 3.1}}}, quant: {status: 'running', installed: true, pool: [{code: '300750', name: '宁德时代', last: {action: 'HOLD', price: 240, changePct: 1}}]}};
  const home = new JSDOM(marketHomeCard(st)).window.document;
  assert.equal(home.querySelectorAll('#mkHome .mk-idx').length, 5); assert.ok(home.querySelector('[data-page="market"]')); assert.match(home.body.textContent, /涨停 28/);
  assert.match(new JSDOM(marketHomeCard({})).window.document.body.textContent, /正在获取大盘行情/);
  const page = new JSDOM(marketPage(st, {action})).window.document;
  assert.equal(page.querySelectorAll('.mk-movers').length, 2); assert.ok(page.querySelector('.mk-tile[data-action="mkSector"][data-id="BK1036"]'));
  assert.ok(page.querySelector('[data-action="mkAlertRemove"][data-id="a1"]')); assert.ok(page.querySelector('.mk-row[data-action="mkStock"][data-id="301313"]'));
  assert.ok(new JSDOM(marketPage(st, {action, tab: 'concept'})).window.document.querySelector('.mk-tile[data-id="BK1675"]'));
  const sv = new JSDOM(marketPage(st, {action, stock: '600519'})).window.document;
  assert.ok(sv.querySelector('.mk-box[data-mk-code="600519"]')); assert.ok(sv.querySelector('[data-action="mkAddPool"][data-id="600519"]'));
  assert.ok(new JSDOM(marketPage(st, {action, stock: '300750'})).window.document.querySelector('[data-action="quantOpen"][data-id="300750"]'));
  const dom = new JSDOM(`<div id="r">${klineBox('300750', {marks: [{date: '2026-11-03', type: 'buy'}]})}</div>`), r = dom.window.document.getElementById('r'), calls = [];
  const call = async p => { calls.push(p); return p.period === 'intraday' ? {result: {code: '300750', name: '宁德时代', preClose: 10, points: [{price: 10, avg: 10, volume: 1}, {price: 11, avg: 10.5, volume: 1}], quote: {price: 11, pct: 10}}} : {result: {code: '300750', name: '宁德时代', bars: bars(30), quote: {price: 12, pct: 1.2, open: 11}}}; };
  mountKlineBoxes(dom.window.document, call); await new Promise(x => setTimeout(x, 10));
  assert.ok(r.querySelector('.mk-kline')); assert.match(r.querySelector('.mk-quote').textContent, /宁德时代/); assert.deepEqual(calls[0], {action: 'kline', code: '300750', period: 'day'});
  r.querySelector('[data-mk="period:intraday"]').click(); await new Promise(x => setTimeout(x, 10)); assert.ok(r.querySelector('.mk-trend'));
  r.querySelector('[data-mk="period:day"]').click(); await new Promise(x => setTimeout(x, 10)); assert.equal(calls.length, 2, 'day bars served from cache');
  assert.deepEqual(opsMarks([{date: '2026-11-03', action: '加仓', price: 9}, {date: '2026-11-04', action: '减仓'}, {date: 'x', action: '观望'}]).map(m => m.type), ['buy', 'sell']);
  const fd = new dom.window.FormData(); fd.append('query', ' 宁德 '); fd.append('kind', 'up'); fd.append('value', '5'); assert.deepEqual(marketAlertPayload(fd), {query: '宁德', kind: 'up', value: 5});
  assert.match(sectorStocksView({stocks: [{code: '600360', name: '华微电子', price: 9, pct: 10}]}), /mkStock/);
  const qp = new JSDOM(quantPage(st, {action, heading: () => '', empty: x => x, date: String})).window.document.querySelector('[data-quant="300750"]');
  assert.match(qp.textContent, /250/); assert.ok(qp.querySelector('.q-live'));
  const hq = homeQuant(st, {action, icon: () => ''}); assert.match(hq, /250\.00/);
  const det = quantPage(st, {action, heading: () => '', empty: x => x, date: String, open: '300750', detail: {summary: {code: '300750', action: 'HOLD', backtest: {}}, charts: {ops: [{date: '2026-11-03', action: '加仓'}]}}});
  assert.match(det, /class="qk-card mk-box" data-mk-code="300750"/);
});

test('wiring: main, preload, renderer, sidebar, test loader, README', async () => {
  const [main, pre, app, sb, home, loader, md, css] = await Promise.all(['../main.mjs', '../preload.cjs', '../src/app.js', '../src/ui/sidebar.js', '../src/ui/home-dashboard.js', './helpers/load-ui.mjs', '../../README.md', '../src/workbench.css'].map(read));
  assert.match(main, /createMarketService\(\{ store, lookup: createStockLookup\(\)/); assert.match(main, /register\('market'/); assert.match(main, /market: market\?\.view\(\)\|\|null/); assert.match(main, /void market\?\.tick\(\)/); assert.match(main, /get market\(\) \{ return market; \}/);
  assert.match(pre, /'quant','market','agent'/);
  for (const s of ["if (page === 'market') // [F1]", "startsWith('mk')) return marketAction(actionId, id)", 'mountKlineBoxes(document', "p?.page === 'market'", "['market', 'trend', '行情']", 'marketPing()', 'marketRefreshView()']) assert.ok(app.includes(s), s);
  assert.match(sb, /page === 'quant' \|\| page === 'market'/); assert.match(home, /marketHomeCard\(state, \{date\}\)/);
  assert.match(loader, /marketPage,marketHomeCard,mountKlineBoxes/); assert.equal(loader.split('marketPage,marketHomeCard,mountKlineBoxes').length, 4);
  assert.ok(md.includes('### 行情工作台：指数、板块与 K 线')); assert.ok(css.includes('[F1] 行情工作台'));
});
