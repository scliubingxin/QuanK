import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { initialState } from '../core.mjs';
import { createConversationService } from '../services/conversation.mjs';
import { createMarketService } from '../services/market.mjs';
import { minuteKlineCommand, session, updateLiveBars } from '../src/shared/market.js';
import { composerSendMode } from '../src/shared/page-command.js';
import { klineBox, liveTargets, mountKlineBoxes, setKlinePeriod, patchLive, quoteLine } from '../src/ui/market.js';
import { marketStockTab, restoreTabs } from '../src/ui/page-panel.js';

const code = '600438';
const at = Date.parse('2026-11-23T13:21:12+08:00');
const quote = {price: 11.22, change: 0.11, pct: 0.99, open: 11.28, high: 11.30, low: 11.10, preClose: 11.11, amount: 187e6, turnover: 0.37, volume: 190};
const result = {at, indices: [{secid: '1.000001', price: 3514.83, pct: -0.54}], quotes: {[code]: quote}};
const bar = date => ({date, open: 11.2, close: 11.21, high: 11.23, low: 11.18, volume: 20, amount: 22000});

test('the per-second renderer tick updates the main index and right tab in place, and pauses when hidden or closed', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('let liveBusy = false;');
  const end = app.indexOf('function marketPing()', start);
  const {document} = new JSDOM(`<main><button data-live-idx="1.000001"><b>—</b><span></span></button><small data-live-at></small><input value="draft"></main><aside id="pagePanel">${quoteLine({code})}</aside>`, {pretendToBeVisual: true}).window;
  const panel = document.querySelector('aside'), price = panel.querySelector('[data-live-price]');
  const input = document.querySelector('input');
  input.focus();
  let tick, time = at, calls = 0;
  runInNewContext(app.slice(start, end), {
    api: {}, document, state: {market: {overview: {indices: []}}}, marketSession: session,
    liveTargets, patchLive, Date: {now: () => time},
    setInterval(fn, delay) { assert.equal(delay, 1000); tick = fn; },
    async invoke(channel, args) { assert.equal(channel, 'market'); assert.equal(args.action, 'live'); calls++; return {result}; },
  });
  const step = async () => { tick(); await new Promise(setImmediate); };
  await step();
  assert.equal(calls, 1);
  assert.equal(price.textContent, '11.22');
  assert.equal(document.querySelector('[data-live-idx] b').textContent, '3514.83');
  assert.match(document.querySelector('[data-live-at]').textContent, /13:21:12/);
  for (const [key, value] of Object.entries({change: '+0.11 +0.99%', open: '11.28', high: '11.30', low: '11.10', preClose: '11.11', amount: '1.87亿', turnover: '0.37%'}))
    assert.equal(panel.querySelector(`[data-live-field="${key}"]`).textContent, value);
  assert.equal(panel.querySelector('[data-live-price]'), price);
  assert.equal(document.activeElement, input);
  panel.hidden = true;
  document.querySelector('main').hidden = true;
  await step();
  assert.equal(calls, 1);
  panel.hidden = false;
  time = Date.parse('2026-11-23T12:30:00+08:00');
  await step();
  assert.equal(calls, 1);
  time = at;
  Object.defineProperty(document, 'hidden', {value: true});
  await step();
  assert.equal(calls, 1);
});

test('minute K lines prefer Tencent and map klt on Eastmoney fallback', async () => {
  const calls = [];
  const service = createMarketService({store: {data: {}}, now: () => at, fetcher: async url => {
    calls.push(url);
    const parsed = new URL(url), param = parsed.searchParams.get('param') || '', klt = parsed.searchParams.get('klt');
    const body = parsed.pathname.endsWith('/mkline')
      ? (() => { const n = /,m(\d+),/.exec(param)?.[1] || ''; return {code: 0, data: {sh600438: n === '15' ? {} : {['m' + n]: [['202611231330', 11.2, 11.22, 11.25, 11.1, 30]]}}}; })()
      : klt ? {rc: 0, data: {code, klines: ['2026-11-23 13:25,11.2,11.22,11.25,11.1,30']}}
      : {rc: 0, data: {diff: [{f12: code, f13: 1, f2: 11.22}]}};
    return {ok: true, text: async () => JSON.stringify(body)};
  }});
  for (const n of [1, 5, 15, 30, 60]) {
    const d = await service.handle({action: 'kline', code, period: 'm' + n});
    assert.equal(d.period, 'm' + n);
    assert.equal(d.bars.length, 1);
    assert.ok(calls.some(u => new URL(u).searchParams.get('param') === `sh600438,m${n},,320`), 'Tencent is asked first for m' + n);
    if (n !== 15) assert.equal(d.source, 'tencent');
  }
  assert.ok(calls.some(u => new URL(u).searchParams.get('klt') === '15'), 'an empty Tencent answer falls back to Eastmoney klt');
  const dead = createMarketService({store: {data: {}}, now: () => at, fetcher: async () => { throw new Error('fetch failed'); }});
  await assert.rejects(dead.handle({action: 'kline', code, period: 'm5'}), /行情接口暂时连不上/);
});

test('minute candles update OHLC and volume until their boundary, then append; daily OHLC uses the session totals', () => {
  const start = [bar('2026-11-23 13:20'), bar('2026-11-23 13:25')];
  const a = updateLiveBars(start, 'm5', quote, at, {day: '2026-11-23', volume: 180, amount: 186e6});
  assert.equal(a.bars.at(-1).close, 11.22);
  assert.equal(a.bars.at(-1).low, 11.18);
  assert.equal(a.bars.at(-1).volume, 30);
  assert.equal(a.bars.length, 2);
  const b = updateLiveBars(a.bars, 'm5', {...quote, price: 11.3, volume: 196}, Date.parse('2026-11-23T13:25:01+08:00'), a.previous);
  assert.equal(b.bars.at(-1).date, '2026-11-23 13:30');
  assert.equal(b.bars.at(-1).open, 11.3);
  assert.equal(b.bars.at(-1).volume, 6);
  assert.equal(b.bars.length, 3);
  const daily = updateLiveBars([bar('2026-11-20')], 'day', quote, at);
  const d = daily.bars.at(-1);
  assert.deepEqual([d.date, d.open, d.high, d.low, d.close, d.volume], ['2026-11-23', 11.28, 11.3, 11.1, 11.22, 190]);
});

test('live chart preserves the rendered SVG and active hover, and minute charts omit daily buy/sell marks', async () => {
  const {document, MouseEvent} = new JSDOM(`<aside id="pagePanel">${klineBox(code,{marks: [{date:'2026-11-23',type:'buy'}]})}</aside>`, {pretendToBeVisual:true}).window;
  const bars = [bar('2026-11-23 13:20'), bar('2026-11-23 13:25')];
  mountKlineBoxes(document, async () => ({code, name:'通威股份', quote, bars}), {now: () => at});
  document.querySelector('[data-mk="period:m5"]').click();
  await new Promise(setImmediate);
  const svg = document.querySelector('.mk-kline'), hit = svg.querySelector('[data-i="1"]');
  hit.dispatchEvent(new MouseEvent('mousemove',{bubbles:true}));
  patchLive(document, result);
  assert.equal(document.querySelector('.mk-kline'), svg);
  assert.equal(svg.querySelector('[data-i="1"]'), hit);
  assert.match(document.querySelector('.mk-hover').textContent, /13:25.*收 11.22/);
  assert.equal(svg.querySelector('.mk-cross').style.opacity, '0.7');
  assert.equal(svg.querySelector('.mk-mark'), null);
});

test('compact period menu preserves indicator and range controls and reflects the selected period', async () => {
  const css = await readFile(new URL('../src/workbench.css', import.meta.url), 'utf8');
  const {window} = new JSDOM(`<style>${css}</style><aside style="width:800px">${klineBox(code)}</aside>`);
  const toolbar = window.document.querySelector('.mk-toolbar');
  const more = toolbar.querySelector('.mk-more');
  const summary = more.querySelector('summary');
  const values = (root, selector) => Array.from(root.querySelectorAll(selector), b => b.dataset.mk);
  assert.match(css, /@container mkchart \(max-width:840px\)\s*\{\s*\.mk-wide-period\{display:none\}\s*\.mk-more\{display:block\}/);
  assert.equal(window.getComputedStyle(toolbar).flexWrap, 'nowrap');
  assert.deepEqual(values(toolbar, '.mk-periods > button'), ['period:day', 'period:week', 'period:month', 'period:m5', 'period:intraday']);
  assert.deepEqual(values(toolbar, '.mk-wide-period button'), values(more, 'button'));
  assert.deepEqual(values(more, 'button'), ['period:m1', 'period:m15', 'period:m30', 'period:m60']);
  assert.deepEqual(values(toolbar, '.mk-seg:not(.mk-periods) button'), ['sub:macd', 'sub:kdj', 'range:60', 'range:120', 'range:250']);

  more.style.display = 'block'; // JSDOM does not apply container queries.
  summary.tabIndex = 0; // JSDOM does not model the summary element's native focusability.
  setKlinePeriod(code, 'm15');
  mountKlineBoxes(window.document, async () => ({code, quote, bars: []}), {now: () => at});
  assert.match(summary.textContent, /15分/);
  assert.ok(summary.classList.contains('chosen'));
  summary.click();
  assert.equal(more.open, true);
  more.querySelector('[data-mk="period:m30"]').click();
  assert.equal(more.open, false);
  assert.equal(window.document.activeElement, summary);
  assert.match(summary.textContent, /30分/);
  summary.click();
  summary.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
  assert.equal(more.open, false);
  toolbar.querySelector('[data-mk="period:day"]').click();
  assert.match(summary.textContent, /更多/);
  assert.ok(!summary.classList.contains('chosen'));
});

test('Chinese chat commands open the matching stock tab and minute period without a model call', async () => {
  const commands = [['看通威 5 分钟 K 线', '通威', '600438', 'm5'], ['宁德时代 15 分钟线', '宁德时代', '300750', 'm15']];
  const opened = [];
  const store = {data: initialState(), async save() {}, log() {}};
  const c = createConversationService({store, active: new Map(), view: () => store.data, request: () => assert.fail('called model'),
    appTools: {openMarket: (...args) => opened.push(args), market: {async handle(p) {
      if (p.action === 'resolve') return {code: commands.find(row => row[1] === p.query)[2], name: p.query};
      assert.equal(p.action, 'kline');
      return {period: p.period};
    }}}});
  for (const [prompt, query, stock, period] of commands) {
    assert.deepEqual(minuteKlineCommand(prompt), {query, period});
    assert.equal(composerSendMode(prompt, {plan:true}), 'page');
    const r = await c.run({prompt});
    assert.match(r.chats.at(-1).messages.at(-1).content, /已在右侧页签打开/);
    assert.deepEqual(opened.at(-1), [stock, period, query]);
    const tab = marketStockTab(stock, query, period);
    assert.deepEqual(restoreTabs({tabs:[tab], active:tab.id}).tabs, [tab]);
  }
});
