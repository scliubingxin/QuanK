// [v0.53] 投研资料 page (by stock and kind, maintainable), quant reports archived into the library, training data
// (record → label → export), calibration selectors with '>' kept, 半自动委托 first under 自动化, report summary objects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, readFile as rf } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { recordOf, labelOf, datasetStats, toCsv, toJsonl, createDatasetService } from '../services/dataset.mjs';
import { researchPage, researchStocks, filterLibrary, datasetBox, noteEditForm } from '../src/ui/research-page.js';
import { normalizeBroker, brokerReady } from '../src/shared/trade.js';
import { reportsBox } from '../src/ui/quant.js';
import { automationPage } from '../src/ui/automation.js';
import { NAV_LAYOUT } from '../src/ui/sidebar.js';
import { LIBRARY_KINDS } from '../src/shared/research.js';

const NOW = Date.UTC(2026, 10, 23, 8, 0); // Mon 16:00 CST
const bars = Array.from({length: 40}, (_, i) => { const d = new Date(Date.UTC(2026, 8, 1) + i * 86400e3).toISOString().slice(0, 10); const c = 10 + i * 0.1; return {date: d, close: c, high: c + 0.2, low: c - 0.3}; });

test('dataset rows: record from a quant summary, forward labels, outcome and stats', () => {
  const s = {action: 'BUY', actionText: '买入', score: 72.5, scoreRaw: 70, multiplier: 1.5, probPct: 61.2, price: 10, date: bars[0].date, name: '通威股份', factors: [{name: '趋势', score: 12}, {name: 'RSI', score: 6}], model: 'v6.2.0'};
  const r = recordOf('600438', s, NOW);
  assert.deepEqual([r.date, r.code, r.action, r.score, r.multiplier, r.probPct, r.factors], [bars[0].date, '600438', 'BUY', 72.5, 1.5, 61.2, {趋势: 12, RSI: 6}]);
  assert.equal(recordOf('6004', s), null); assert.equal(recordOf('600438', {}), null);
  const l = labelOf(r, bars);
  assert.deepEqual([l.ret1, l.ret5, l.ret20, l.outcome, l.complete], [1, 5, 20, 'right', true]);
  assert.equal(l.maxUp20, 22); assert.equal(l.maxDown20, -2);
  assert.equal(labelOf({...r, date: bars[30].date}, bars).complete, false, 'not 20 bars yet');
  assert.equal(labelOf({...r, action: 'SELL'}, bars).outcome, 'wrong');
  assert.equal(labelOf({...r, action: 'HOLD'}, bars).outcome, null);
  const rows = [{...r, label: l}, {...r, code: '600519', action: 'SELL', label: labelOf({...r, action: 'SELL'}, bars)}, {...r, date: bars[30].date}];
  const st = datasetStats(rows);
  assert.deepEqual([st.total, st.labelled, st.pending, st.stocks, st.hitRate], [3, 2, 1, 2, 50]);
  assert.deepEqual(st.byAction.BUY, {n: 1, hitRate: 100, avgRet20: 20});
  const csv = toCsv(rows);
  assert.match(csv.split('\n')[0], /^\ufeffdate,code,name,action,score,scoreRaw,multiplier,probPct,price,changePct,model,plan,ret1,ret5,ret10,ret20,maxUp20,maxDown20,outcome,f_趋势,f_RSI$/);
  assert.equal(csv.trim().split('\n').length, 4, 'header + all 3 rows by default');
  assert.equal(toCsv(rows, {labelledOnly: true}).trim().split('\n').length, 3);
  assert.equal(toJsonl(rows, {labelledOnly: true}).trim().split('\n').length, 2);
});

test('dataset service: one row per stock and day, labels after the close, export to the strategy project', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'qk-ds-')), src = await mkdtemp(path.join(tmpdir(), 'qk-src-'));
  let t = NOW, saved = '';
  const svc = createDatasetService({dir, now: () => t, quantSource: () => src, market: {handle: async () => ({bars})}, saveDialog: async () => (saved = path.join(dir, 'out.csv'))});
  const base = {action: 'BUY', score: 70, price: 10, date: bars[0].date};
  await svc.record('600438', base); await svc.record('600438', {...base, score: 71}); await svc.record('600519', {...base, action: 'HOLD'});
  let v = svc.view(); assert.equal(v.stats.total, 2); assert.equal(v.recent.find(r => r.code === '600438').score, 71, 'the latest of the day wins');
  const l = await svc.handle({action: 'label'}); assert.equal(l.labelled, 2);
  await assert.rejects(createDatasetService({dir: await mkdtemp(path.join(tmpdir(), 'qk-ds2-'))}).handle({action: 'export'}), /还没有标注完成/);
  const p = await svc.handle({action: 'export', target: 'project', format: 'csv'});
  assert.equal(p.file, path.join(src, 'quank_dataset', 'signals_labelled.csv')); assert.equal(p.count, 2);
  assert.match(await rf(p.file, 'utf8'), /600438/);
  const e = await svc.handle({action: 'export', format: 'jsonl'}); assert.equal(e.file, saved); assert.equal(e.count, 2);
  const again = createDatasetService({dir, now: () => t}); assert.equal((await again.handle({action: 'view'})).stats.total, 2, 'persisted on disk');
  t = Date.UTC(2026, 10, 23, 3, 0); assert.equal(await svc.tick(), null, 'labels only after 15:30');
});

const lib = [
  {id: 'a', kind: 'report', code: '600438', name: '通威股份', title: '通威研报', summary: '硅料', time: 5, format: 'docx'},
  {id: 'b', kind: 'note', code: '600438', name: '通威股份', title: '电话会', summary: '减产', time: 4, preview: '减产计划'},
  {id: 'c', kind: 'quant', code: '', name: '', title: '算法日报 · 2026-11-22', summary: '1 条研判', time: 3},
  {id: 'd', kind: 'notice', code: '600519', name: '贵州茅台', title: '分红公告', time: 2},
];
test('投研资料 page: stocks, kinds, search, maintain, knowledge, reports and training data together', () => {
  const action = (l, a, id = '', k = '') => `<button data-action="${a}" data-id="${id}" class="${k}">${l}</button>`;
  const state = {research: {library: lib}, quant: {pool: [{code: '600438', name: '通威股份'}, {code: '000876', name: '新希望'}], reportDefs: [{id: 'daily', title: '算法日报', schedule: 'daily'}], reports: {daily: {ok: true, at: 1, date: '2026-11-22', summary: {text: '当日 1 条研判', n: 1}, metrics: []}}}, knowledge: {}, dataset: {stats: {total: 3, labelled: 1, pending: 2, stocks: 1, hitRate: 100, byAction: {BUY: {n: 1, hitRate: 100, avgRet20: 20}}}, recent: [], project: '/x/quank_dataset'}};
  assert.deepEqual(researchStocks(state).map(s => [s.code, s.count]), [['600438', 2], ['000876', 0], ['600519', 1]]);
  assert.deepEqual(filterLibrary(lib, {stock: '600438'}).map(x => x.id), ['a', 'b']);
  assert.deepEqual(filterLibrary(lib, {stock: '_'}).map(x => x.id), ['c']);
  assert.deepEqual(filterLibrary(lib, {kind: 'quant'}).map(x => x.id), ['c']);
  assert.deepEqual(filterLibrary(lib, {query: '减产'}).map(x => x.id), ['b']);
  const html = researchPage(state, {action, date: String, stock: '600438'});
  assert.match(html, /通威股份 的资料/); assert.match(html, /data-action="researchEdit" data-id="b"/); assert.doesNotMatch(html, /data-action="researchEdit" data-id="a"/);
  assert.match(html, /data-action="researchReport" data-id="600438"/); assert.match(html, /data-action="rpKind" data-id="quant">量化日报/);
  assert.match(html, /id="knowledgeBox"|投研知识库/); assert.match(html, /日报与复盘/); assert.match(html, /id="datasetBox"/);
  assert.match(html, /当日 1 条研判/, 'report summaries that are objects are shown as text'); assert.doesNotMatch(html, /\[object Object\]/);
  assert.match(datasetBox(state.dataset, {action, date: String}), /写入策略项目/);
  assert.match(noteEditForm({title: 'T', text: 'x', tags: ['a', 'b']}), /value="a b"/);
  assert.equal(LIBRARY_KINDS.quant, '量化日报');
  assert.doesNotMatch(reportsBox(state.quant, {action, date: String}), /object Object/);
});

test('calibration selectors with ">" are kept; 半自动委托 is the first tab; wiring', async () => {
  const b = normalizeBroker({url: 'https://t.cmschina.com/x', buy: {code: 'body > div:nth-of-type(2) > input:nth-of-type(1)', price: '#p', shares: 'input[name="qty"]', submit: 'body > div > button'}});
  assert.equal(b.buy.code, 'body > div:nth-of-type(2) > input:nth-of-type(1)'); assert.equal(brokerReady(b, 'buy'), true);
  assert.equal(normalizeBroker({buy: {code: 'a{}'}}).buy.code, ''); assert.equal(normalizeBroker({buy: {code: 'div[style*="url(x)"]'}}).buy.code, '');
  const action = (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`;
  const html = automationPage({tasks: [], chats: [], trade: {settings: {}, usage: {}, paper: {}, broker: {}, orders: [], history: []}}, {action, empty: () => '', tab: 'trade'});
  assert.ok(html.indexOf('data-id="trade"') < html.indexOf('data-id="tasks"'), '半自动委托 first');
  assert.ok(NAV_LAYOUT.find(n => n.group === 'library').items[0][0] === 'research');
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  const [app, main, quant, research, engine, trade] = await Promise.all(['../src/app.js', '../main.mjs', '../src/ui/quant.js', '../services/research.mjs', '../services/quant-engine.mjs', '../services/trade.mjs'].map(read));
  assert.match(app, /tab: taskTab \|\| \(state\.trade \? 'trade' : 'tasks'\)/);
  assert.match(app, /if \(page === 'research'\) return researchPage\(/);
  for (const a of ['rpOpen', 'rpStock', 'rpKind', 'rpSearch', 'datasetLabel', 'datasetExport', 'researchEdit']) assert.ok(app.includes(`'${a}'`), a);
  assert.match(main, /onSignal: \(code, summary\) => \{ void dataset\?\.record/); assert.match(main, /action: 'archive', kind: 'quant'/); assert.match(main, /register\('dataset'/);
  assert.doesNotMatch(quant, /\$\{researchLibraryBox\(state\.research/); assert.match(quant, /data-action|rpOpen/);
  assert.match(research, /a === 'noteUpdate'/); assert.match(research, /reportKey/);
  assert.match(engine, /onSignal\?\.\(c, entry\.summary\)/); assert.match(engine, /await onReport\?\.\(out, md\)/);
  assert.match(trade, /const missing = what === 'orders'/);
});

test('[v0.53.1] custom agent avatars never crash, whatever the id hashes to', async () => {
  const {agentAvatar} = await import('../src/ui/avatars.js');
  for (const id of ['quant-analyst', 'risk-officer', 'custom', 'a', '量化策略师', 'x'.repeat(40)]) for (let i = 0; i < 50; i++) assert.match(agentAvatar({id: id + i, name: 'n'}), /<svg/);
});

test('[v0.53.1] chat can open every page (投研资料 with filters, 半自动委托 tab); popups do not wait for a re-render', async () => {
  const {appToolDefinitions, executeAppTool, APP_INTENT} = await import('../services/app-tools.mjs');
  const def = appToolDefinitions().find(d => d.function.name === 'app_open_page').function.parameters;
  for (const p of ['research', 'security', 'quant', 'feed', 'tasks', 'graph', 'context', 'agents', 'connectors', 'market']) assert.ok(def.properties.page.enum.includes(p), p);
  const opened = [];
  const run = a => executeAppTool('app_open_page', a, {store: {data: {}}, deps: {openPage: (page, extra) => opened.push([page, extra])}});
  await run({page: 'research', stock: '600438', kind: 'quant'}); await run({page: 'tasks', tab: 'trade'}); await run({page: 'research', stock: 'x', kind: 'bad'});
  assert.deepEqual(opened, [['research', {stock: '600438', kind: 'quant'}], ['tasks', {tab: 'trade'}], ['research', {}]]);
  for (const q of ['查看我的自选', '打开资料库', '看看我的委托单', '去动态看看', '查看知识图谱', '打开投研资料']) assert.ok(APP_INTENT.test(q), q);
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  const [app, main] = await Promise.all(['../src/app.js', '../main.mjs'].map(read));
  assert.match(app, /if \(p\?\.page === 'research'\) \{ rpStock = /); assert.match(app, /marketRefreshView\(\); signalPopups\(\); \}/);
  assert.match(main, /openPage: \(page, extra = \{\}\) =>/);
});
