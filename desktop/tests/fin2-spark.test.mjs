import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { sparkSvg, poolTrend } from '../src/ui/spark.js';
import { sparkSeries } from '../src/shared/quant.js';
import { homeQuant } from '../src/ui/home-quant.js';
import { quantPage } from '../src/ui/quant.js';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const action = (l, a, id = '', c = 'secondary') => `<button class="${c}" data-action="${a}" data-id="${id}">${l}</button>`;
const icon = () => '';
const UP = [10, 10.5, 10.2, 11, 11.4, 12], DOWN = [8, 7.9, 7.6, 7.7, 7.2, 7];

test('sparkSeries reads the adapter series, keeps the last n positive prices', () => {
  const ad = {fields: {series: {path: 'signals', price: 'price'}}};
  const raw = {signals: [{price: 0}, {price: 'x'}, ...Array.from({length: 80}, (_, i) => ({price: 10 + i / 1000}))]};
  const s = sparkSeries(ad, raw);
  assert.equal(s.length, 60); assert.equal(s[0], 10.02); assert.equal(s.at(-1), 10.079);
  assert.deepEqual(sparkSeries({}, raw), []); assert.deepEqual(sparkSeries(ad, {}), []);
});

test('sparkSvg: colour by direction, needs 5 points, deterministic ids', () => {
  const up = new JSDOM(sparkSvg(UP, {id: '600001'})).window.document.querySelector('svg');
  assert.ok(up.classList.contains('up')); assert.match(up.innerHTML, /#ef4444/); assert.equal(up.querySelectorAll('path').length, 2);
  assert.match(sparkSvg(DOWN, {id: 'a'}), /class="hq-spark down"[\s\S]*#10b981/);
  assert.equal(sparkSvg([1, 2, 3]), ''); assert.equal(sparkSvg(null), '');
  assert.equal(sparkSvg(UP, {id: 'k'}), sparkSvg(UP, {id: 'k'}));
  assert.match(sparkSvg([5, 5, 5, 5, 5]), /<path d="M0\.0 /, 'flat series does not divide by zero');
});

test('poolTrend: aligned on the latest point, average percent move', () => {
  const t = poolTrend([UP, [...DOWN, 7], [1, 2]]);
  assert.equal(t.count, 2); assert.equal(t.days, 6);
  assert.equal(t.series[0], 0); assert.equal(t.pct, Math.round(((12 / 10 - 1) * 100 + (7 / 7.9 - 1) * 100) / 2 * 100) / 100);
  assert.equal(poolTrend([[1, 2]]), null); assert.equal(poolTrend(null), null);
});

test('home quant panel: sparkline in each tile, no pool-average box', () => {
  const q = {status: 'running', installed: true, holdings: {}, pool: [
    {code: '600001', name: 'A', last: {action: 'BUY', score: 70, price: 12, changePct: 1}, spark: UP},
    {code: '600002', name: 'B', last: {action: 'SELL', score: 20, price: 7, changePct: -1}, spark: DOWN},
    {code: '600003', name: 'C', last: {action: 'HOLD', score: 50, price: 3, changePct: 0}}]};
  const doc = new JSDOM(homeQuant({quant: q}, {action, icon, date: String})).window.document;
  const tiles = [...doc.querySelectorAll('.hq-stock')];
  assert.ok(tiles[0].querySelector('svg.hq-spark.up') && tiles[1].querySelector('svg.hq-spark.down')); assert.equal(tiles[2].querySelector('svg'), null);
  assert.equal(doc.querySelector('.hq-trend'), null, '[red] pool-average trend removed from the stats row');
  const none = new JSDOM(homeQuant({quant: {...q, pool: q.pool.map(({spark, ...p}) => p)}}, {action, icon, date: String})).window.document;
  assert.equal(none.querySelector('.hq-trend'), null);
});

test('quant page cards carry the sparkline; engine stores it; styles present', async () => {
  const st = {quant: {status: 'running', installed: true, pool: [{code: '600001', name: 'A', last: {action: 'BUY', score: 70, price: 12}, spark: UP}]}};
  const doc = new JSDOM(quantPage(st, {action, heading: (k, t) => `<h1>${t}</h1>`, empty: t => t, date: String})).window.document;
  assert.ok(doc.querySelector('.quant-stock svg.q-spark'));
  const eng = await read('../services/quant-engine.mjs');
  assert.match(eng, /p\.spark = sparkSeries\(ad, raw\)/);
  const css = await read('../src/workbench.css');
  for (const k of ['.hq-spark{', '.hq-trend{', '.q-spark{']) assert.ok(css.includes(k), k);
});
