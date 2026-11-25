import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { normalizeReports, summarizeReport, reportDefsView, normalizeReportAuto, parseReportAuto, describeReportAuto, ADAPTER_FILE } from '../src/shared/quant.js';
import { createQuantEngine, runPythonScript } from '../services/quant-engine.mjs';
import { quantPage, reportsBox, quantReportDetail, quantReportAutoForm, quantReportAutoPayload } from '../src/ui/quant.js';
import { buildFeed } from '../src/shared/feed.js';
import { buildBriefing } from '../src/shared/briefing.js';
import { executeAppTool, appToolDefinitions } from '../services/app-tools.mjs';

const CST = (d, h, m) => Date.UTC(2026, 10, d, h - 8, m);
// A made-up engine with two analysis scripts; QuankSight learns everything from the adapter's `reports` list.
const REPORTS = [
  {id: 'day', title: '示例日报', script: 'rep.py', args: ['{date}'], output: 'out/r_{date}.json', markdown: 'out/r_{date}.md', schedule: 'daily',
    fields: {summary: 'sum', metrics: [['条数', 'n'], ['比例', 'rate', 'pct'], ['缺失', 'none']], warnings: [{path: 'warn', text: '只有 {got} 条，基线 {base} 条'}, {path: 'quiet', text: '不应出现'}], items: {path: 'tips', title: 'f', detail: 's', level: 'lv'}}},
  {id: 'eval', title: '示例评估', script: 'ev.py', args: ['--days', '30'], output: 'out/e_{today}.json', schedule: 'manual', fields: {summary: 'sum'}},
  {id: 'bad1', title: 'x', script: '../x.py', output: 'a.json'}, {id: 'bad2', title: 'x', script: 'x.py', output: '/etc/a.json'}, {id: 'bad3', title: 'x', script: 'x.py', output: 'a/../../b.json'}, {id: 'bad 4', script: 'x.py', output: 'a.json'}, {id: 'bad5', script: 'x.sh', output: 'a.json'}];
const ADAPTER = {engine: {entry: 'run.py', health: '/hz'}, auth: {path: '/auth', okPath: 'ok'}, endpoints: {pool: '/list', signal: '/s/{code}'}, fields: {poolList: 'rows', poolCode: 'c', poolName: 'n'}, reports: REPORTS};

test('helpers: report defs, summaries, auto-run settings', () => {
  const defs = normalizeReports(REPORTS);
  assert.deepEqual(defs.map(d => d.id), ['day', 'eval'], 'scripts outside the engine, absolute or parent paths, bad ids and non-python scripts are dropped');
  assert.equal(defs[1].schedule, 'manual'); assert.deepEqual(reportDefsView(ADAPTER), [{id: 'day', title: '示例日报', schedule: 'daily'}, {id: 'eval', title: '示例评估', schedule: 'manual'}]);
  assert.deepEqual(normalizeReports([{id: 'a', script: 'a.py', output: 'a.json', args: ['x\ny']}]), [], 'arguments with newlines rejected');
  assert.deepEqual(reportDefsView(null), []);
  const s = summarizeReport(defs[0], {sum: '一切正常', n: 12, rate: 0.1234, warn: {got: 3, base: 20}, quiet: null, tips: [{f: '<b>注意</b>', s: '调参', lv: 'high'}, {s: 'no title'}]});
  assert.equal(s.summary, '一切正常'); assert.deepEqual(s.metrics, [{label: '条数', value: '12'}, {label: '比例', value: '12.3%'}]);
  assert.deepEqual(s.warnings, ['只有 3 条，基线 20 条']); assert.deepEqual(s.items, [{title: '<b>注意</b>', detail: '调参', level: 'high'}]);
  assert.deepEqual(summarizeReport({}, {}), {summary: '', metrics: [], warnings: [], items: []});
  assert.deepEqual(normalizeReportAuto({}), {enabled: false, time: '18:00', minutes: 1080});
  assert.equal(normalizeReportAuto({enabled: true, time: '09:00'}).time, '18:00', 'before the close falls back');
  assert.deepEqual(parseReportAuto({enabled: true, time: '17:30'}), {enabled: true, time: '17:30'});
  assert.throws(() => parseReportAuto({time: '14:59'}), /收盘后/); assert.throws(() => parseReportAuto({time: '7:5'}), /HH:mm/);
  assert.equal(describeReportAuto({enabled: true, time: '17:30'}), '工作日 17:30 自动生成'); assert.equal(describeReportAuto(null), '仅手动生成');
});

test('runPythonScript: no shell, output tail, exit code, timeout', async () => {
  const calls = [];
  const fake = (code, delay = 1) => (cmd, args, o) => { calls.push({cmd, args, o}); const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => setTimeout(() => c.emit('exit', null), 1);
    if (delay >= 0) setTimeout(() => { c.stdout.emit('data', 'x'.repeat(5000)); c.stderr.emit('data', 'END'); c.emit('exit', code); }, delay); return c; };
  const r = await runPythonScript({python: '/py', cwd: '/e', script: 'a.py', args: ['2026-11-20', '; rm -rf /'], spawnFn: fake(0)});
  assert.equal(r.code, 0); assert.equal(r.tail.length, 4000); assert.ok(r.tail.endsWith('END'));
  assert.deepEqual([calls[0].cmd, calls[0].args, calls[0].o.cwd, calls[0].o.shell], ['/py', ['a.py', '2026-11-20', '; rm -rf /'], '/e', undefined]);
  assert.equal(calls[0].o.env.PYTHONDONTWRITEBYTECODE, '1');
  assert.equal((await runPythonScript({python: '/py', cwd: '/e', script: 'a.py', spawnFn: fake(3)})).code, 3);
  const t = await runPythonScript({python: '/py', cwd: '/e', script: 'a.py', timeoutMs: 20, spawnFn: fake(0, -1)});
  assert.equal(t.code, -1); assert.match(t.tail, /超时/);
});

async function fixture({clock = CST(20, 18, 30)} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'wbq5-')), src = path.join(root, 'src');
  await mkdir(src, {recursive: true});
  for (const f of ['run.py', 'rep.py', 'ev.py']) await writeFile(path.join(src, f), 'x');
  await writeFile(path.join(src, ADAPTER_FILE), JSON.stringify(ADAPTER));
  const runs = [], alerts = [], logs = []; let t = clock, fail = false;
  const json = (b, h = {}) => new Response(JSON.stringify(b), {status: 200, headers: {'content-type': 'application/json', ...h}});
  const fetcher = async url => { const u = new URL(url); if (u.pathname === '/hz') return json({}); if (u.pathname === '/auth') return json({ok: true}, {'set-cookie': 'sid=1'}); if (u.pathname === '/list') return json({rows: [{c: '600001', n: '示例一'}]}); return json({}); };
  const spawn = () => { const c = new EventEmitter(); c.kill = () => setTimeout(() => c.emit('exit', 0), 1); return c; };
  const runScript = async o => {
    runs.push(o);
    if (fail) return {code: 2, tail: 'Traceback: boom'};
    await mkdir(path.join(o.cwd, 'out'), {recursive: true});
    if (o.script === 'rep.py') { const d = o.args[0]; await writeFile(path.join(o.cwd, 'out', `r_${d}.json`), JSON.stringify({sum: `${d} 共 5 条`, n: 5, rate: 0.2, warn: d === '2026-11-19' ? {got: 1, base: 9} : null, tips: [{f: '偏差', s: '检查', lv: 'medium'}]})); await writeFile(path.join(o.cwd, 'out', `r_${d}.md`), `# 日报 ${d}\n\n正文`); }
    if (o.script === 'ev.py') await writeFile(path.join(o.cwd, 'out', 'e_2026-11-20.json'), JSON.stringify({sum: '评估完成'}));
    return {code: 0, tail: ''};
  };
  const store = {data: {}, save() {}, log: (a, b) => logs.push([a, b])};
  const engine = createQuantEngine({dir: path.join(root, 'ud'), store, spawn, fetcher, runScript, onAlert: a => alerts.push(a), probe: () => ({ok: true}), port: async () => 18400, now: () => t, exists: p => p.endsWith('python3') || existsSync(p)});
  await engine.sync({source: src});
  return {engine, store, runs, alerts, logs, root, setTime: v => { t = v; }, setFail: v => { fail = v; }, cleanup: () => rm(root, {recursive: true, force: true})};
}

test('engine: run reports, view, markdown, failures, path safety', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(f.engine.view().reportDefs.map(d => d.id), ['day', 'eval']);
    const r = await f.engine.handle({action: 'reportRun', id: 'day'});
    assert.equal(r.ok, true); assert.equal(r.summary, '2026-11-20 共 5 条'); assert.deepEqual(r.metrics.map(m => m.value), ['5', '20%']); assert.equal(r.hasMarkdown, true);
    assert.deepEqual([f.runs[0].script, f.runs[0].args, f.runs[0].cwd], ['rep.py', ['2026-11-20'], f.engine.engineDir]);
    assert.equal(f.engine.view().reports.day.summary, '2026-11-20 共 5 条'); assert.equal(f.engine.view().reports.day.md, undefined, 'markdown body stays out of the view');
    const v = await f.engine.handle({action: 'report', id: 'day'});
    assert.match(v.md, /# 日报 2026-11-20/);
    const old = await f.engine.handle({action: 'reportRun', id: 'day', date: '2026-11-19'});
    assert.deepEqual(old.warnings, ['只有 1 条，基线 9 条']);
    assert.equal(f.store.data.quant.alerts[0].kind, 'report'); assert.equal(f.store.data.quant.alerts[0].reportId, 'day');
    await assert.rejects(f.engine.handle({action: 'reportRun', id: 'day', date: '2026-11-21'}), /不晚于今天/);
    await assert.rejects(f.engine.handle({action: 'reportRun', id: 'bad1'}), /没有这份报告/);
    await assert.rejects(f.engine.handle({action: 'report', id: 'eval'}), /还没有生成/);
    const e = await f.engine.handle({action: 'reportRun', id: 'eval'});
    assert.equal(e.ok, true); assert.deepEqual(f.runs.at(-1).args, ['--days', '30']); assert.equal((await f.engine.handle({action: 'report', id: 'eval'})).md, '');
    f.setFail(true);
    const bad = await f.engine.handle({action: 'reportRun', id: 'day'});
    assert.equal(bad.ok, false); assert.match(bad.error, /代码 2.*boom/); assert.deepEqual(f.logs.at(-1)[0], '示例日报生成失败');
    assert.equal(existsSync(path.join(f.root, 'ud', 'reports', 'day.md')), false, 'stale markdown removed after a failure');
    f.setFail(false);
    await rm(path.join(f.engine.engineDir, 'ev.py'));
    await assert.rejects(f.engine.handle({action: 'reportRun', id: 'eval'}), /没有 ev\.py/);
  } finally { await f.cleanup(); }
});

test('engine: weekday after-close auto run, once per day', async () => {
  const f = await fixture({clock: CST(20, 17, 0)});
  try {
    assert.equal(await f.engine.tick(), null, 'off by default');
    assert.deepEqual(await f.engine.handle({action: 'reportAuto', enabled: true, time: '17:30'}), {auto: {enabled: true, time: '17:30', minutes: 1050}, text: '工作日 17:30 自动生成'});
    await assert.rejects(f.engine.handle({action: 'reportAuto', time: '10:00'}), /收盘后/);
    assert.equal(await f.engine.tick(), null, 'before the time');
    f.setTime(CST(20, 17, 31));
    const r = await f.engine.tick();
    assert.equal(r.kind, 'reports'); assert.deepEqual(r.results.map(x => x.id), ['day'], 'only daily reports run automatically');
    assert.equal(f.alerts.length, 1); assert.equal(f.alerts[0].kind, 'report');
    f.setTime(CST(20, 19, 0)); assert.equal(await f.engine.tick(), null, 'once per day');
    f.setTime(CST(21, 18, 0)); assert.equal(await f.engine.tick(), null, 'not on Saturday');
    f.setTime(CST(23, 18, 0)); assert.equal((await f.engine.tick()).kind, 'reports');
  } finally { await f.cleanup(); }
});

test('feed, briefing, page and viewer', () => {
  const T = CST(20, 18, 0);
  const alerts = [{id: 'report-day-1', kind: 'report', time: T, reportId: 'day', title: '示例日报', ok: true, summary: '共 5 条', warnings: ['链路中断']}, {id: 'report-eval-2', kind: 'report', time: T - 1, reportId: 'eval', title: '示例评估', ok: false, summary: '脚本退出'}];
  const data = {quant: {alerts, pool: [{code: '600001', name: '示例一'}]}, tasks: [], chats: [], connectors: [], connectorItems: []};
  const rows = buildFeed(data).filter(i => i.kind === 'quant');
  assert.deepEqual(rows.map(r => [r.title, r.status, r.actions[0].action, r.actions[0].id]), [['示例日报：共 5 条', 'failed', 'quantReport', 'day'], ['示例评估生成失败', 'failed', 'quantReport', 'eval']]);
  assert.match(rows[0].detail, /链路中断/);
  const b = buildBriefing(data, T + 3600e3);
  const q = b.sections.find(s => s.id === 'quant');
  assert.deepEqual(q.items.slice(0, 2).map(i => [i.action, i.id]), [['quantReport', 'day'], ['quantReport', 'eval']]); assert.match(q.items[0].text, /示例日报：共 5 条/);
  const action = (l, a, id = '', c = 'secondary') => `<button class="${c}" data-action="${a}" data-id="${id}">${l}</button>`;
  const heading = (k, t) => `<h1>${t}</h1>`, empty = t => t, date = () => '今天';
  const st = {status: 'running', installed: true, source: '/s', pool: [], features: {}, reportDefs: reportDefsView(ADAPTER), reportAuto: {enabled: true, time: '17:30'},
    reports: {day: {ok: true, at: T, date: '2026-11-20', summary: '<i>共 5 条</i>', metrics: [{label: '条数', value: '5'}], warnings: ['链路中断']}}};
  const doc = new JSDOM(reportsBox(st, {action, date})).window.document; // [v0.53] 日报与复盘 moved to 资料库 → 投研资料
  const cards = doc.querySelectorAll('.q-reports .q-report');
  assert.equal(cards.length, 2); assert.match(cards[0].textContent, /示例日报.*有告警.*5条数.*<i>共 5 条<\/i>.*链路中断.*重新生成.*查看/s); assert.match(cards[1].textContent, /尚未生成.*生成/s);
  assert.equal(cards[1].querySelector('[data-action="quantReport"]'), null);
  assert.match(doc.querySelector('.q-reports small').textContent, /工作日 17:30 自动生成/);
  assert.equal(reportsBox({...st, reportDefs: []}, {action, date}), '');
  assert.equal(new JSDOM(quantPage({quant: st}, {action, heading, empty, date})).window.document.querySelector('.q-reports'), null, 'not on the quant page any more');
  const det = new JSDOM(quantReportDetail({title: '示例日报', date: '2026-11-20', ms: 4200, summary: 's', metrics: [{label: 'a', value: '1'}], warnings: ['w'], items: [{title: '<b>t</b>', detail: 'd', level: 'high'}]})).window.document;
  assert.match(det.body.textContent, /4 秒/); assert.equal(det.querySelector('.q-report-items .t-red').textContent, 'high'); assert.equal(det.querySelector('.q-report-items b').textContent, '<b>t</b>');
  const form = new JSDOM(`<form>${quantReportAutoForm(st)}</form>`).window.document.querySelector('form');
  assert.equal(form.querySelector('[name=enabled]').checked, true); assert.equal(form.querySelector('[name=time]').value, '17:30'); assert.match(form.textContent, /示例日报/);
  const fd = new FormData(); fd.append('enabled', 'on'); fd.append('time', '18:15');
  assert.deepEqual(quantReportAutoPayload(fd), {action: 'reportAuto', enabled: true, time: '18:15'});
});

test('app tools and wiring', async () => {
  const names = appToolDefinitions().map(d => d.function.name);
  for (const n of ['app_quant_report', 'app_quant_report_auto']) assert.ok(names.includes(n), n);
  const seen = [], asks = [];
  const quant = {view: () => ({status: 'running', reportDefs: [{id: 'day', title: '示例日报', schedule: 'daily'}], reports: {day: {ok: true, summary: 's'}}, reportAuto: {}}),
    handle: async p => { seen.push(p); if (p.action === 'report') return {ok: true, summary: 's', md: 'x'.repeat(9000)}; if (p.action === 'reportRun') return {ok: true, summary: 'new'}; return {text: '工作日 18:00 自动生成'}; }};
  const run = (name, args, answer = true) => executeAppTool(name, args, {store: {data: {}}, deps: {quant, notify() {}}, ask: async (t, d) => { asks.push([t, d]); return answer; }});
  const list = await run('app_quant_report', {});
  assert.deepEqual(list.reports.map(r => [r.id, r.title, r.summary]), [['day', '示例日报', 's']]); assert.equal(seen.length, 0);
  const one = await run('app_quant_report', {id: 'day'});
  assert.equal(one.report.md.length, 6000, 'markdown clipped for the model');
  assert.equal((await run('app_quant_report', {id: 'day', run: true})).report.summary, 'new'); assert.equal(seen.at(-1).action, 'reportRun'); assert.equal(asks.length, 0, 'running the local analysis needs no confirm');
  await assert.rejects(run('app_quant_report_auto', {enabled: true, time: '09:00'}), /收盘后/);
  assert.equal((await run('app_quant_report_auto', {enabled: true, time: '18:00'}, false)).status, 'denied'); assert.match(asks.at(-1)[1], /工作日 18:00/);
  assert.equal((await run('app_quant_report_auto', {enabled: true, time: '18:00'})).status, 'succeeded');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const a of ['quantReportRun', 'quantReport', 'quantReportAuto']) assert.ok(app.includes(`'${a}'`), a);
  assert.match(app, /app_quant_report: '量化报告'/);
  const main = await readFile(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /a\.kind === 'report'/);
});
