// [v46] stock detail fixes: compact money, return %, backtest marks aligned to bars, quote fallback from bars.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { moneyShort, backtestReturns, returnSvg, niceTicks } from '../src/ui/quant.js';
import { opsMarks, quoteLine } from '../src/ui/market.js';
import { alignMarks, quoteFromBars, klineSvg } from '../src/shared/market.js';
import { chartGrids } from '../src/shared/quant.js';

test('moneyShort keeps KPI amounts short', () => {
  assert.equal(moneyShort(-302255), '-30.23万');
  assert.equal(moneyShort(338855), '33.89万');
  assert.equal(moneyShort(11470), '11,470.00');
  assert.equal(moneyShort(123456789), '1.23亿');
  assert.equal(moneyShort(5000, true), '+5,000.00');
  assert.equal(moneyShort(null), '—');
});

test('backtestReturns: (value - invested) / invested, own or shared cost, zero cost skipped', () => {
  const shared = backtestReturns([['日期', '智能定投市值', '普通定投市值', '智能定投投入'], ['d0', 0, 0, 0], ['d1', 110, 90, 100], ['d2', 120, null, 100]]);
  assert.equal(shared.ownCostB, false);
  assert.deepEqual(shared.rows, [{date: 'd1', a: 10, b: -10}, {date: 'd2', a: 20, b: null}]);
  assert.equal(shared.labels.title, '回测：智能定投 vs 普通定投收益率');
  const own = backtestReturns([['日期', 'A', 'B', '投入', 'B投入'], ['d1', 150, 150, 100, 200]]);
  assert.deepEqual(own.rows, [{date: 'd1', a: 50, b: -25}]);
  assert.match(returnSvg(shared.rows), /<svg[^>]*q-return-svg/); assert.match(returnSvg(shared.rows), />0%</);
  assert.match(returnSvg([]), /回测数据不足/);
  const g = chartGrids({fields: {curves: {a: {path: 'a', label: '智能'}, b: {path: 'b', label: '普通'}, costLabel: '投入'}}}, {a: [{date: '2026-01-02', value: 1, cost: 1}], b: [{date: '2026-01-02', value: 2, cost: 3}]});
  assert.deepEqual(g.curve[0], ['日期', '智能', '普通', '投入', '普通投入']); assert.deepEqual(g.curve[1], ['2026-01-02', 1, 2, 1, 3]);
});

test('opsMarks understands BUY / SELL and carries the hover details', () => {
  const m = opsMarks([{date: '2026-09-03', action: 'BUY', price: 11.28, shares: 20, reason: '震荡市定投'}, {date: '2026-09-10', action: 'STRONG_SELL', price: 12}, {date: '2026-09-11', action: 'HOLD'}]);
  assert.deepEqual(m.map(x => x.type), ['buy', 'sell']);
  assert.equal(m[0].text, '2026-09-03 · 买入 · 价格 11.28 · 20 股 · 震荡市定投');
});

const days = n => Array.from({length: n}, (_, i) => { const d = new Date(Date.UTC(2026, 0, 5 + i)); const c = 10 + Math.sin(i / 3); return {date: d.toISOString().slice(0, 10), open: c, close: c + 0.1, high: c + 0.3, low: c - 0.3, volume: 1000}; });

test('alignMarks puts a daily trade on its week bar and drops marks after the last bar', () => {
  const weeks = [{date: '2026-01-09'}, {date: '2026-01-16'}, {date: '2026-01-23'}];
  const a = alignMarks(weeks, [{date: '2026-01-13', type: 'buy'}, {date: '2026-01-16', type: 'sell'}, {date: '2026-02-01', type: 'buy'}, {date: '2026-01-07', type: 'buy'}]);
  assert.deepEqual([...a.keys()].sort(), [0, 1]); assert.equal(a.get(1).length, 2); assert.equal(a.get(0).length, 1);
  assert.equal(alignMarks(weeks, [{date: '2025-06-01', type: 'buy'}]).size, 0, 'far before the first bar');
  const bars = days(150), svg = klineSvg(bars, {last: 60, marks: [{date: bars[149].date, type: 'buy', text: 'x'}, {date: bars[149].date, type: 'sell'}, {date: bars[10].date, type: 'buy'}]});
  assert.equal((svg.match(/class="mk-mark /g) || []).length, 2, 'marks outside the visible range are not drawn');
  assert.match(svg, /【买】x/);
});

test('quote header falls back to the last daily bars', () => {
  const bars = days(5), q = quoteFromBars(bars);
  assert.equal(q.price, bars[4].close); assert.equal(q.preClose, bars[3].close); assert.equal(q.asOf, bars[4].date); assert.ok(q.fromBars);
  assert.equal(quoteFromBars([]), null);
  const html = quoteLine({code: '600438', name: '通威股份', period: 'day', bars, quote: {code: '600438', price: null}});
  const t = new JSDOM(html).window.document.body.textContent;
  assert.doesNotMatch(t.replace(/成交额 —/, ''), /开 —|高 —|低 —|昨收 —/); assert.match(t, /数据截至/);
});

test('return chart: nice ticks include 0, inline sizing beats the icon svg rule, hover columns are invisible', () => {
  const t = niceTicks(-28, 24); assert.ok(t.includes(0)); assert.ok(t[0] <= -28 && t.at(-1) >= 24); assert.ok(t.length <= 8);
  const svg = returnSvg([{date: 'a', a: -28, b: -27}, {date: 'b', a: 24, b: 22}]);
  assert.match(svg, /<svg[^>]*style="display:block;width:100%;height:auto/);
  assert.doesNotMatch(svg, /fill:transparent/); assert.match(svg, /fill-opacity:0;stroke:none/);
  assert.equal((svg.match(/>0%</g) || []).length, 1, 'one 0% label, no near-duplicate like -2%');
});
