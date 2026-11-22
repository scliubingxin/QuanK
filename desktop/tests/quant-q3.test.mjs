import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { normalizeWatch, parseWatch, describeWatch, cstClock, WATCH_INTERVALS, ADAPTER_FILE } from '../src/shared/quant.js';
import { createQuantEngine } from '../services/quant-engine.mjs';
import { buildFeed, visibleFeed, FEED_FILTERS } from '../src/shared/feed.js';
import { buildBriefing, briefingSettings } from '../src/shared/briefing.js';
import { quantPage, quantWatchForm, quantWatchPayload } from '../src/ui/quant.js';
import { feedPage } from '../src/ui/feed.js';
import { executeAppTool, appToolDefinitions } from '../services/app-tools.mjs';

const CST = (d, h, m) => Date.UTC(2026, 10, d, h - 8, m); // November 2026, China time
const ADAPTER = {engine: {entry: 'run.py', health: '/hz'}, auth: {path: '/auth', okPath: 'ok'}, endpoints: {pool: '/list', signal: '/s/{code}'},
  fields: {action: 'a', actionText: 't', score: 's', multiplier: 'x', price: 'p', reasons: 'r', poolList: 'rows', poolCode: 'c', poolName: 'n'}};

test('watch settings, validation, description and the China clock', () => {
  assert.deepEqual(normalizeWatch(), {enabled: false, interval: 15, notify: true, premarket: true, premarketTime: '09:15', premarketMinutes: 555});
  assert.equal(normalizeWatch({interval: 7}).interval, 15); assert.equal(normalizeWatch({premarketTime: '10:00'}).premarketTime, '09:15');
  assert.deepEqual(WATCH_INTERVALS, [1, 2, 5, 10, 15, 30, 60]); // [v0.52.1] 1 and 2 minutes added
  assert.deepEqual(parseWatch({enabled: true, interval: '30', premarketTime: '08:50', notify: false, junk: 1}), {enabled: true, notify: false, interval: 30, premarketTime: '08:50'});
  assert.throws(() => parseWatch({interval: 3}), /5 \/ 10/); assert.throws(() => parseWatch({premarketTime: '09:45'}), /06:00–09:29/); assert.throws(() => parseWatch({premarketTime: 'x'}), /06:00/);
  assert.equal(describeWatch({}), '盯盘提醒未开启');
  assert.equal(describeWatch({enabled: true, interval: 10}), '交易时段每 10 分钟检查 · 工作日 09:15 盘前简报 · 系统通知');
  assert.equal(describeWatch({enabled: true, premarket: false, notify: false}), '交易时段每 15 分钟检查');
  assert.deepEqual(cstClock(CST(20, 9, 20)), {day: '2026-11-20', weekday: true, minutes: 560});
  assert.equal(cstClock(CST(21, 10, 0)).weekday, false);
  assert.equal(cstClock(Date.UTC(2026, 10, 19, 17, 0)).day, '2026-11-20', 'UTC evening is the next China day');
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'wbq3-')), src = path.join(root, 'src');
  await mkdir(src, {recursive: true});
  await writeFile(path.join(src, 'run.py'), 'x'); await writeFile(path.join(src, ADAPTER_FILE), JSON.stringify(ADAPTER));
  let clock = CST(20, 10, 0);
  const state = {'600001': 'HOLD', '600002': 'HOLD'}, calls = [], alerts = [];
  const json = (b, h = {}) => new Response(JSON.stringify(b), {status: 200, headers: {'content-type': 'application/json', ...h}});
  const fetcher = async url => {
    const u = new URL(url); calls.push(u.pathname);
    if (u.pathname === '/hz') return json({});
    if (u.pathname === '/auth') return json({ok: true}, {'set-cookie': 'sid=1; Path=/'});
    if (u.pathname === '/list') return json({rows: [{c: '600001', n: '示例一'}, {c: '600002', n: '示例二'}]});
    const m = /^\/s\/(\d{6})$/.exec(u.pathname);
    if (m) { if (state[m[1]] === 'ERR') return new Response(JSON.stringify({error: '取数失败'}), {status: 500, headers: {'content-type': 'application/json'}});
      return json({a: state[m[1]], t: state[m[1]] === 'BUY' ? '分批买入' : '', s: state[m[1]] === 'BUY' ? 72 : 50, x: 1, p: 10, r: ['理由']}); }
    return new Response('{}', {status: 404});
  };
  const spawn = () => { const c = new EventEmitter(); c.kill = () => setTimeout(() => c.emit('exit', 0), 1); return c; };
  const store = {data: {}, save() {}};
  const engine = createQuantEngine({dir: path.join(root, 'ud'), store, spawn, fetcher, probe: () => ({ok: true}), port: async () => 18200, now: () => clock,
    exists: p => p.endsWith('python3') || existsSync(p), onAlert: a => alerts.push(a)});
  await engine.sync({source: src}); await engine.start(); await engine.handle({action: 'pool'});
  return {engine, store, state, calls, alerts, setClock: t => { clock = t; }, sig: () => calls.filter(p => p.startsWith('/s/')).length, cleanup: async () => { await engine.stop(); await rm(root, {recursive: true, force: true}); }};
}

test('engine watch: scans in trading hours at the chosen interval, records changes once, pre-market digest once a day', async () => {
  const f = await fixture();
  try {
    assert.equal(await f.engine.tick(), null, 'disabled by default');
    const w = await f.engine.handle({action: 'watch', enabled: true, interval: 15});
    assert.equal(w.watch.enabled, true); assert.match(w.text, /每 15 分钟/);
    await assert.rejects(f.engine.handle({action: 'watch', interval: 3}), /分钟/);
    const r1 = await f.engine.tick();
    assert.equal(r1.kind, 'watch'); assert.equal(r1.changes.length, 0, 'the first scan only sets the baseline'); assert.equal(f.sig(), 2);
    assert.equal(await f.engine.tick(), null, 'interval not elapsed');
    f.setClock(CST(20, 10, 16)); f.state['600002'] = 'BUY';
    const r2 = await f.engine.tick();
    assert.equal(r2.changes.length, 1);
    assert.deepEqual([f.alerts.length, f.alerts[0].kind, f.alerts[0].code, f.alerts[0].from, f.alerts[0].to, f.alerts[0].toText, f.alerts[0].name], [1, 'change', '600002', 'HOLD', 'BUY', '分批买入', '示例二']);
    f.setClock(CST(20, 12, 0)); assert.equal(await f.engine.tick(), null, 'lunch break');
    f.setClock(CST(21, 10, 0)); assert.equal(await f.engine.tick(), null, 'weekend');
    f.setClock(CST(23, 9, 20)); f.state['600001'] = 'SELL';
    const r3 = await f.engine.tick();
    assert.equal(r3.kind, 'premarket'); assert.deepEqual(r3.digest.counts, {total: 2, buy: 1, sell: 1, failed: 0});
    assert.deepEqual(f.alerts.slice(1).map(a => a.kind), ['change', 'digest']);
    f.setClock(CST(23, 9, 25)); assert.equal(await f.engine.tick(), null, 'one digest per day');
    f.setClock(CST(23, 9, 45)); const r4 = await f.engine.tick(); assert.equal(r4.kind, 'watch');
    f.state['600001'] = 'ERR'; f.state['600002'] = 'ERR'; f.setClock(CST(23, 10, 5));
    const r5 = await f.engine.tick();
    assert.equal(r5.results.every(x => x.error), true); assert.ok(f.engine.view().watchError, 'error shown when every stock fails');
    const v = f.engine.view();
    assert.equal(v.alerts.length, 3); assert.equal(v.watch.interval, 15); assert.ok(v.lastWatch);
    const n = await f.engine.handle({action: 'scanNow'}); assert.equal(n.kind, 'watch');
  } finally { await f.cleanup(); }
});

const DATA = () => ({quant: {pool: [{code: '600001', name: '示例一', last: {action: 'SELL', actionText: '', score: 30, multiplier: 0}}, {code: '600002', name: '示例二', last: {action: 'BUY', actionText: '分批买入', score: 72, multiplier: 1.5}}],
  alerts: [{id: 'd1', kind: 'digest', time: CST(23, 9, 20), counts: {total: 2, buy: 1, sell: 1, failed: 0}, items: [{code: '600002', name: '示例二', action: 'BUY', actionText: '分批买入'}]},
    {id: 'c1', kind: 'change', time: CST(23, 9, 20), code: '600001', name: '示例一', from: 'HOLD', to: 'SELL', score: 30, multiplier: 0, price: 9.8, reason: '跌破区间'}]}});

test('feed: quant changes and digests, with their own filter', () => {
  const items = buildFeed(DATA()).filter(x => x.kind === 'quant');
  assert.equal(items.length, 2);
  const ch = items.find(x => x.id === 'quant:c1'), dg = items.find(x => x.id === 'quant:d1');
  assert.equal(ch.title, '示例一：持有 → 卖出'); assert.match(ch.detail, /综合分 30 · 倍率 0× · 现价 9.8 · 跌破区间/);
  assert.deepEqual(ch.actions, [{label: '查看详情', action: 'quantOpen', id: '600001'}]);
  assert.equal(dg.title, '盘前量化简报：2 只，1 个买点，1 个风控提示'); assert.match(dg.detail, /示例二 分批买入/); assert.equal(dg.actions[0].action, 'quantHome');
  assert.ok(FEED_FILTERS.some(([id, l]) => id === 'quant' && l === '量化'));
  assert.equal(visibleFeed(DATA(), 'quant').length, 2);
  assert.equal(buildFeed({}).filter(x => x.kind === 'quant').length, 0);
  const action = (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`;
  const doc = new JSDOM(feedPage(DATA(), {action, date: () => '今天', heading: (k, t) => `<h1>${t}</h1>`, empty: t => t, filter: 'quant'})).window.document;
  assert.equal(doc.querySelectorAll('.feed-row.fk-quant').length, 2);
});

test('briefing: 量化信号 section only when a pool exists, changes first', () => {
  const d = DATA(); d.briefings = [{time: CST(22, 9, 0), day: 'x'}];
  assert.ok(briefingSettings(d).sections.includes('quant'));
  const b = buildBriefing(d, CST(23, 9, 30)), sec = b.sections.find(s => s.id === 'quant');
  assert.equal(sec.title, '量化信号');
  assert.deepEqual(sec.items.map(i => i.text), ['信号变化 · 示例一：持有 → 卖出', '示例一：卖出 · 综合分 30 · 0×', '示例二：分批买入 · 综合分 72 · 1.5×']);
  assert.equal(sec.items[0].action, 'quantOpen');
  assert.ok(!buildBriefing({}, CST(23, 9, 30)).sections.some(s => s.id === 'quant'));
});

test('page: watch line, recent changes, settings form', () => {
  const action = (l, a, id = '', c = 'secondary') => `<button class="${c}" data-action="${a}" data-id="${id}">${l}</button>`;
  const heading = (k, t) => `<h1>${t}</h1>`, empty = t => t, date = () => '今天';
  const q = {...DATA().quant, status: 'running', installed: true, source: '/s', watch: {enabled: true, interval: 10}, lastWatch: 1, watchError: '<b>x</b>'};
  const doc = new JSDOM(quantPage({quant: q}, {action, heading, empty, date})).window.document;
  assert.match(doc.querySelector('.q-watch').textContent, /交易时段每 10 分钟检查/); assert.match(doc.querySelector('.q-watch').textContent, /<b>x<\/b>/);
  assert.ok(doc.querySelector('[data-action="quantWatch"]'));
  const rows = doc.querySelectorAll('.q-alerts li');
  assert.equal(rows.length, 1); assert.match(rows[0].textContent, /示例一/); assert.equal(rows[0].querySelector('button').dataset.action, 'quantOpen');
  const off = new JSDOM(quantPage({quant: {status: 'stopped', pool: []}}, {action, heading, empty, date})).window.document;
  assert.match(off.querySelector('.q-watch').textContent, /未开启/); assert.equal(off.querySelector('.q-alerts'), null);
  const form = new JSDOM(`<form>${quantWatchForm({watch: {enabled: true, interval: 30, premarketTime: '08:45', notify: false}})}</form>`).window.document.querySelector('form');
  assert.equal(form.querySelector('[name=interval]').value, '30'); assert.equal(form.querySelector('[name=premarketTime]').value, '08:45');
  const fd = new FormData(); fd.append('enabled', 'on'); fd.append('interval', '5'); fd.append('premarketTime', '09:00'); fd.append('premarket', 'on');
  assert.deepEqual(quantWatchPayload(fd), {action: 'watch', enabled: true, interval: 5, premarket: true, premarketTime: '09:00', notify: false});
});

test('app tool app_quant_watch needs confirmation; status shows watch and recent changes', async () => {
  assert.ok(appToolDefinitions().some(d => d.function.name === 'app_quant_watch'));
  const seen = [];
  const quant = {view: () => ({status: 'running', source: '/s', pool: [], watch: {enabled: true, interval: 15}, alerts: DATA().quant.alerts}), handle: async p => { seen.push(p); return {watch: normalizeWatch({...p, enabled: p.enabled}), text: describeWatch(p)}; }};
  const run = (name, args, answer = true) => executeAppTool(name, args, {store: {data: {}}, deps: {quant, notify() {}}, ask: async () => answer});
  const st = await run('app_quant_status', {});
  assert.match(st.watch, /每 15 分钟/); assert.deepEqual(st.recentChanges.map(x => x.code), ['600001']);
  assert.equal((await run('app_quant_watch', {enabled: true, interval: 5}, false)).status, 'denied'); assert.equal(seen.length, 0);
  const r = await run('app_quant_watch', {enabled: true, interval: 5});
  assert.equal(r.status, 'succeeded'); assert.deepEqual(seen[0], {action: 'watch', enabled: true, interval: 5});
  await assert.rejects(run('app_quant_watch', {interval: 3}), /分钟/);
});

test('wiring: main tick and notification, app handlers', async () => {
  const read = p => readFile(new URL(p, import.meta.url), 'utf8');
  const [main, app] = await Promise.all([read('../main.mjs'), read('../src/app.js')]);
  assert.match(main, /void quant\?\.tick\(\)\.catch/); assert.match(main, /onAlert: a =>/); assert.match(main, /盘前量化简报/);
  for (const a of ['quantWatch', 'quantHome']) assert.ok(app.includes(`'${a}'`), a);
  assert.match(app, /app_quant_watch: '设置盯盘提醒'/);
});
