// [v47.1] K lines when Eastmoney's history host refuses the connection: Tencent fallback + a readable error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createMarketService, parseTxKline, parseTxMinute, parseTxQuote, txSymbol } from '../services/market.mjs';
import { klineBox, mountKlineBoxes } from '../src/ui/market.js';

const QT = ['1', '通威股份', '600438', '11.11', '11.39', '11.15', '358367', '154663', '203704', ...Array(22).fill('0'), '-0.28', '-2.46', '11.31', '11.09', '11.11/358367/400102417', '358367', '40010', '0.80', '-4.53'];
const day = n => Array.from({length: n}, (_, i) => [`2026-10-${String(1 + i).padStart(2, '0')}`, '11.360', String(11.2 + i / 100), '11.370', '11.050', '304905.000']);
const FQ = n => ({code: 0, msg: '', data: {sh600438: {qfqday: day(n), qfqweek: day(n), qfqmonth: [['2004-03-31', '-4.542', '-4.717', '-4.4', '-4.8', '100'], ...day(n)], qt: {sh600438: QT}}}});
const MIN = {code: 0, data: {sh600438: {data: {data: ['0930 11.15 3724 4152260.00', '0931 11.27 14360 16071247.00', 'bad row']}, qt: {sh600438: QT}}}};

test('Tencent parsers: symbol, quote, K lines, minute data', () => {
  assert.deepEqual(['600438', '000001', '300750', '830799', '920001'].map(txSymbol), ['sh600438', 'sz000001', 'sz300750', 'bj830799', 'bj920001']);
  const q = parseTxQuote(QT);
  assert.deepEqual([q.name, q.price, q.preClose, q.open, q.high, q.low, q.pct, q.change, q.turnover, q.amount], ['通威股份', 11.11, 11.39, 11.15, 11.31, 11.09, -2.46, -0.28, 0.8, 40010e4]);
  assert.equal(parseTxQuote(['1']), null);
  const k = parseTxKline(FQ(5), '600438', 'day');
  assert.equal(k.bars.length, 5); assert.equal(k.bars[0].date, '2026-10-01'); assert.equal(k.bars[0].pct, null); assert.equal(k.bars[1].pct, 0.09); assert.equal(k.quote.price, 11.11);
  const m = parseTxKline({code: 0, data: {sh600438: {m60: [['202611201500', '11.1', '11.11', '11.13', '11.09', '120.00']]}}}, '600438', 'm60');
  assert.equal(m.bars[0].date, '2026-11-20 15:00');
  assert.throws(() => parseTxKline({code: 0, data: {sh600438: {}}}, '600438'), /没有取到 K 线/);
  assert.equal(parseTxKline(FQ(3), '600438', 'month').bars.length, 3, 'negative forward-adjusted rows dropped');
  const t = parseTxMinute(MIN, '600438');
  assert.equal(t.points.length, 2); assert.deepEqual([t.points[1].time, t.points[1].price, t.points[1].volume], ['09:31', 11.27, 10636]); assert.equal(t.preClose, 11.39);
});

function svc(route) {
  const calls = [];
  const fetcher = async url => { calls.push(url); const r = route(url); if (r instanceof Error) throw r; const body = JSON.stringify(r); return {ok: true, status: 200, text: async () => body}; };
  return {m: createMarketService({store: {data: {}, save: async () => {}}, fetcher, now: () => Date.UTC(2026, 10, 21, 12)}), calls};
}

test('service: push2his refused -> Tencent K lines with quote; every host down -> one readable error', async () => {
  const down = () => new TypeError('fetch failed');
  const {m, calls} = svc(url => /gtimg\.cn\/appstock\/app\/fqkline/.test(url) ? FQ(40) : /minute\/query/.test(url) ? MIN : down());
  const k = await m.handle({action: 'kline', code: '600438', period: 'day'});
  assert.equal(k.source, 'tencent'); assert.equal(k.bars.length, 40); assert.equal(k.name, '通威股份'); assert.equal(k.quote.price, 11.11);
  assert.ok(calls.some(u => /push2his/.test(u)), 'Eastmoney is tried first');
  assert.match(calls.find(u => /fqkline/.test(u)), /param=sh600438,day,,,320,qfq/);
  const w = await m.handle({action: 'kline', code: '600438', period: 'week'}); assert.equal(w.source, 'tencent');
  assert.match(calls.filter(u => /fqkline/.test(u)).at(-1), /,week,/);
  const i = await m.handle({action: 'kline', code: '600438', period: 'intraday'}); assert.equal(i.points.length, 2); assert.equal(i.preClose, 11.39);
  const s = await m.handle({action: 'kline', code: '600438', period: 'day', summary: true}); assert.ok(s);
  const empty = svc(url => /fqkline/.test(url) ? {code: 0, data: {sh600438: {}}} : down());
  await assert.rejects(empty.m.handle({action: 'kline', code: '600438', period: 'month'}), /没有取到 K 线/, 'Tencent answered but had no rows: say so');
  const dead = svc(down);
  await assert.rejects(dead.m.handle({action: 'kline', code: '600438', period: 'day'}), e => /行情接口暂时连不上/.test(e.message) && !/fetch failed/.test(e.message));
});

test('UI: an IPC "fetch failed" error is shown as a readable message', async () => {
  const dom = new JSDOM(`<div id="r">${klineBox('600438')}</div>`), r = dom.window.document.getElementById('r');
  mountKlineBoxes(dom.window.document, async () => { throw new Error("Error invoking remote method 'market': TypeError: fetch failed"); });
  await new Promise(x => setTimeout(x, 10));
  assert.equal(r.querySelector('.task-error').textContent, '行情接口暂时连不上，请检查网络后点周期按钮重试');
});

import { chartGrids } from '../src/shared/quant.js';
import { backtestReturns, quantPage } from '../src/ui/quant.js';
const CURVES = {a: {path: 'a', label: '智能定投市值'}, b: {path: 'b', label: '普通定投市值'}, costLabel: '智能定投投入', date: 'date', value: 'value', cost: 'cost'};
const RAW = {a: [{date: '2026-11-19', value: 30000, cost: 190000, cash: 130000}, {date: '2026-11-20', value: 32725.93, cost: 195000, cash: 135909.09}], b: [{date: '2026-11-19', value: 100000, cost: 168000}, {date: '2026-11-20', value: 101518.39, cost: 170454.55}]};
test('[v47.1] smart-plan return counts the uninvested cash when the engine reports it', () => {
  const g = chartGrids({fields: {curves: {...CURVES, cash: 'cash'}}}, RAW);
  assert.deepEqual(g.curve[0], ['日期', '智能定投市值', '普通定投市值', '智能定投投入', '普通定投市值投入', '智能定投现金']);
  const r = backtestReturns(g.curve);
  assert.equal(r.withCash, true); assert.equal(r.ownCostB, true);
  assert.equal(r.rows.at(-1).a, -13.52, 'same as the engine summary'); assert.equal(r.rows.at(-1).b, -40.44);
  const noCash = backtestReturns(chartGrids({fields: {curves: CURVES}}, RAW).curve);
  assert.equal(noCash.withCash, false); assert.equal(noCash.rows.at(-1).a, -83.22);
  assert.equal(backtestReturns([['日期', 'A', 'B', '投入', 'B投入'], ['d1', 150, 150, 100, 200]]).rows[0].b, -25, 'v46 layout unchanged');
});
test('[v47.1] without cash in the curve the chart says why it disagrees with the summary', () => {
  const action = (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`, heading = () => '', empty = () => '', date = t => String(t);
  const detail = s => ({summary: {name: '通威股份', action: 'HOLD', score: 34, backtest: {smartPct: -13.52, blindPct: -40.44}, factors: [], reasons: [], gates: [], indicators: []}, charts: {curve: chartGrids({fields: {curves: s}}, RAW).curve, ops: []}});
  const html = s => new JSDOM(quantPage({quant: {status: 'running', pool: [{code: '600438', name: '通威股份'}]}}, {action, heading, empty, date, open: '600438', detail: detail(s)})).window.document;
  const bad = html(CURVES); assert.match(bad.querySelector('.q-return-note.warn').textContent, /-13\.52%/);
  const good = html({...CURVES, cash: 'cash'}); assert.equal(good.querySelector('.q-return-note.warn'), null); assert.match(good.querySelector('.q-legend').textContent, /-13\.52%/);
});
