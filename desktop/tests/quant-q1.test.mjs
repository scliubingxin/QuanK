import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { normalizeCode, syncIncluded, summarize, chartGrids, isTradingTime, QUANT_INTENT, actionLabel, actionTone, normalizeAdapter, fill, fillDeep, pick, ADAPTER_FILE } from '../src/shared/quant.js';
import { createQuantEngine, probePython } from '../services/quant-engine.mjs';
import { quantPage, quantDashboards, quantAddPayload, quantSettingsPayload, quantSettingsForm } from '../src/ui/quant.js';
import { executeAppTool, appToolDefinitions, appToolContext } from '../services/app-tools.mjs';

// A made-up engine: QuankSight only learns its shape from this adapter.
const ADAPTER = {title: '测试引擎', engine: {entry: 'run.py', requires: ['pkg_a'], health: '/hz'}, auth: {path: '/auth', user: 'u', pass: 'p', okPath: 'ok', userIdPath: 'who.id'},
  endpoints: {pool: '/list', signal: '/s/{code}', quote: '/q/{code}', insight: '/ai/{code}?uid={uid}', poolAdd: {path: '/pool/add', body: {uid: '{uid}', sym: '{code}', label: '{name}'}}, poolRemove: {path: '/pool/del', body: {uid: '{uid}', sym: '{code}'}}},
  insight: {available: 'ok', text: 'body', reason: 'why'},
  config: {file: 'settings.json', dropFromSource: 'secret|pwd', importOnce: ['book'], set: {bind: '{host}', listen: '{port}', login: '{user}', pwd: '{pass}', llm_key: '{ai.key}', llm_url: '{ai.baseUrl}', llm_model: '{ai.model}', notify: false}},
  sync: {exclude: ['^scratch/', '\\.tmp$']}, labels: {price: '价格', score: '评分'},
  fields: {action: 'out.verdict', actionText: 'out.verdict_cn', score: 'out.pts', scoreRaw: 'out.pts0', multiplier: 'out.x', pause: 'out.paused', price: 'out.px', date: 'out.day', changePct: 'out.chg', detail: 'out.why',
    reasons: 'out.notes', factors: {path: 'out.parts', name: 'n', score: 'v', max: 'm', reason: 'r'}, gates: 'out.limits.lines', gateCap: 'out.limits.cap', gateApplied: 'out.limits.on', advice: ['out.size', 'out.tip'],
    indicators: [['RSI', 'out.rsi'], ['缺失', 'out.none']], probPct: 'out.p', model: 'out.mv', plan: 'plan',
    backtest: {smartPct: 'bt.sum.a', blindPct: 'bt.sum.b', excess: 'bt.sum.d', winRate: 'bt.sum.w', trades: 'bt.sum.n', maxDrawdown: 'bt.sum.dd'},
    series: {path: 'hist', date: 'd', price: 'c', score: 's', type: 't'}, curves: {a: {path: 'bt.ca', label: '策略'}, b: {path: 'bt.cb', label: '基准'}, costLabel: '投入', date: 'd', value: 'v', cost: 'k'},
    ops: {path: 'bt.ops', date: 'd', action: 'a', price: 'p', shares: 'n', amount: 'm', score: 's', reason: 'r'}, quoteName: 'nm', quotePrice: 'last', quoteChange: 'pct', poolList: 'rows', poolCode: 'c', poolName: 'n'}};
const RAW = {plan: '每天1次', hist: [{d: '2026-11-18', c: 11.4, s: 40, t: 'hold'}, {d: '2026-11-19', c: 11.39, s: 36, t: 'buy'}, {d: '2026-11-20', c: 11.23, s: 34, t: 'hold'}],
  out: {verdict: 'HOLD', verdict_cn: '暂停买入', pts: 34, pts0: 53.5, x: 0, paused: true, px: 11.23, day: '2026-11-20', chg: -1.4, why: '说明', notes: ['理由一', {text: '理由二'}], parts: [{n: '因子A', m: 30, v: 12.5, r: 'r1'}],
    limits: {on: true, cap: 34, lines: ['上限 34']}, size: '本次暂停', tip: '未到区间', rsi: 47.2, p: 41.2, mv: 'm1'},
  bt: {sum: {a: 12.3, b: 4.5, d: 7.8, w: 61, n: 40, dd: -18.2}, ca: [{d: '2026-11-19', v: 100, k: 90}, {d: '2026-11-20', v: 101, k: 90}], cb: [{d: '2026-11-19', v: 99}, {d: '2026-11-20', v: 98}],
    ops: [{d: '2026-11-19', a: 'BUY', p: 11.39, n: 100, m: 1139, s: 60, r: '低吸'}]}};
const QUOTE = {nm: '示例股份', last: 11.23, pct: -1.4};

test('helpers: codes, adapter validation, placeholders, sync filter, summary, charts, trading time, intent', () => {
  assert.equal(normalizeCode('sh600438'), '600438'); assert.throws(() => normalizeCode('60043'), /6 位/); assert.throws(() => normalizeCode('../x'), /6 位/);
  assert.equal(normalizeAdapter(ADAPTER), ADAPTER);
  for (const [bad, re] of [[{}, /engine\.entry/], [{...ADAPTER, engine: {entry: '../x.py'}}, /engine\.entry/], [{...ADAPTER, auth: {path: 'http://x'}}, /auth\.path/],
    [{...ADAPTER, endpoints: {pool: '/a'}}, /endpoints\.signal/], [{...ADAPTER, endpoints: {...ADAPTER.endpoints, quote: '/a/../b'}}, /endpoints\.quote/], [{...ADAPTER, engine: {entry: 'a.py', requires: ['os; rm']}}, /requires/]])
    assert.throws(() => normalizeAdapter(bad), re);
  assert.equal(fill('/s/{code}?u={uid}', {code: '6 0', uid: 2}, encodeURIComponent), '/s/6%200?u=2');
  assert.deepEqual(fillDeep({p: '{port}', s: 'x{port}', n: ['{ai.key}'], b: false}, {port: 8, ai: {key: 'k'}}), {p: 8, s: 'x8', n: ['k'], b: false});
  assert.equal(pick({a: {b: [0, 5]}}, 'a.b.1'), 5);
  for (const f of ['run.py', 'model.bin', 'sub/k.json', ADAPTER_FILE]) assert.ok(syncIncluded(f, ADAPTER.sync.exclude), f);
  for (const f of ['data.db', 'app.sqlite-wal', '.session_secret', 'keys/my_secret.txt', 'x.log', '__pycache__/a.pyc', '.git/HEAD', '.env', 'scratch/a.py', 'a.tmp']) assert.ok(!syncIncluded(f, ADAPTER.sync.exclude), f);
  assert.ok(syncIncluded('a.tmp', ['[']), 'a broken pattern is ignored');
  const s = summarize(ADAPTER, '600438', RAW, QUOTE);
  assert.deepEqual([s.name, s.action, s.actionText, s.score, s.scoreRaw, s.multiplier, s.price, s.changePct, s.pause], ['示例股份', 'HOLD', '暂停买入', 34, 53.5, 0, 11.23, -1.4, true]);
  assert.deepEqual(s.reasons, ['理由一', '理由二']); assert.deepEqual(s.gates, ['上限 34']); assert.equal(s.gateCap, 34);
  assert.deepEqual(s.factors[0], {name: '因子A', score: 12.5, max: 30, reason: 'r1'}); assert.equal(s.advice, '本次暂停 ｜ 未到区间');
  assert.deepEqual(s.indicators, [{name: 'RSI', value: 47.2}]); assert.equal(s.backtest.excess, 7.8); assert.equal(s.probPct, 41.2); assert.equal(s.plan, '每天1次');
  assert.deepEqual(summarize({}, '600438', {}).reasons, [], 'tolerates an empty adapter / response');
  const g = chartGrids(ADAPTER, RAW);
  assert.deepEqual(g.price[0], ['日期', '价格', '评分']); assert.equal(g.price.length, 4);
  assert.deepEqual(g.curve[0], ['日期', '策略', '基准', '投入']); assert.deepEqual(g.curve[1], ['2026-11-19', 100, 99, 90]);
  assert.equal(g.ops[0].action, 'BUY'); assert.equal(g.marks.length, 1); assert.equal(chartGrids(ADAPTER, {}).price, null);
  assert.equal(isTradingTime(Date.UTC(2026, 10, 20, 2, 0)), true); assert.equal(isTradingTime(Date.UTC(2026, 10, 20, 4, 30)), false); assert.equal(isTradingTime(Date.UTC(2026, 10, 21, 2, 0)), false);
  for (const q of ['这只股票现在什么信号', '池子里谁是买点', '600519 回测怎么样', '帮我看看持仓']) assert.ok(QUANT_INTENT.test(q), q);
  for (const q of ['帮我写一封邮件', '电话 13800138000']) assert.ok(!QUANT_INTENT.test(q), q);
  assert.equal(actionLabel('STRONG_SELL'), '急跌风控'); assert.equal(actionTone('BUY'), 'buy');
});

async function fixture({pythonOk = true, healthAfter = 1, adapter = ADAPTER} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'wbq-')), src = path.join(root, 'src'), dir = path.join(root, 'userdata');
  for (const d of ['scratch', 'sub']) await mkdir(path.join(src, d), {recursive: true});
  for (const f of ['run.py', 'model.bin', 'sub/k.json', 'scratch/a.py', 'a.tmp', 'data.db', '.session_secret']) await writeFile(path.join(src, f), 'x');
  if (adapter) await writeFile(path.join(src, ADAPTER_FILE), JSON.stringify(adapter));
  await writeFile(path.join(src, 'settings.json'), JSON.stringify({secret_key: 'SRC-SECRET', pwd: 'SRC-PWD', mode: 'value', book: {pos: 30500}}));
  const store = {data: {}, save() {}};
  const calls = [], children = [], probes = []; let health = 0, loginN = 0, unauthorizedOnce = true;
  const spawn = (py, args, opts) => { const c = new EventEmitter(); c.killed = []; c.kill = sig => { c.killed.push(sig); setTimeout(() => c.emit('exit', 0), 5); }; c.py = py; c.args = args; c.opts = opts; children.push(c); return c; };
  const json = (b, init = {}) => new Response(JSON.stringify(b), {status: 200, ...init, headers: {'content-type': 'application/json', ...(init.headers || {})}});
  const fetcher = async (url, o = {}) => {
    const u = new URL(url); calls.push({path: u.pathname + u.search, method: o.method || 'GET', cookie: o.headers?.Cookie, body: o.body});
    if (u.pathname === '/hz') { if (++health < healthAfter) throw new Error('ECONNREFUSED'); return new Response('', {status: 404}); }
    if (u.pathname === '/auth') { loginN++; return json({ok: true, who: {id: 7}}, {headers: {'set-cookie': `sid=s${loginN}; Path=/; HttpOnly`}}); }
    if (u.pathname === '/list') { if (unauthorizedOnce) { unauthorizedOnce = false; return json({error: 'unauthorized'}, {status: 401}); } return json({rows: [{c: '600438', n: '示例股份'}, {c: 'bad', n: 'x'}]}); }
    if (u.pathname === '/s/600438') return json(RAW);
    if (u.pathname === '/q/600438') return json(QUOTE);
    if (u.pathname.startsWith('/pool/')) return json({ok: true});
    if (u.pathname === '/ai/600438') return json({ok: false, why: '未配置', body: '【算法结论】暂停买入'});
    return json({error: 'nope'}, {status: 404});
  };
  const engine = createQuantEngine({dir, store, spawn, fetcher, probe: (py, req) => { probes.push(req); return pythonOk ? {ok: true, version: '3.13'} : {ok: false, missing: ['pkg_a']}; }, port: async () => 18123,
    seal: s => 'S:' + s, unseal: s => s.slice(2), aiGateway: () => ({baseUrl: 'https://api.example.com/v1', model: 'm-1', key: 'WB-KEY'}), exists: p => p.endsWith('python3') || existsSync(p)});
  return {root, src, dir, store, engine, calls, children, probes, cleanup: () => rm(root, {recursive: true, force: true})};
}

test('engine: adapter-driven sync, config, start, login, 401 retry, endpoints, cache, stop', async () => {
  const f = await fixture({healthAfter: 2});
  try {
    const r = await f.engine.sync({source: f.src});
    assert.ok(r.files >= 4);
    const eng = path.join(f.dir, 'engine');
    for (const n of ['run.py', 'model.bin', 'sub/k.json', ADAPTER_FILE]) assert.ok(existsSync(path.join(eng, n)), n);
    for (const n of ['data.db', '.session_secret', 'settings.json', 'scratch/a.py', 'a.tmp']) assert.ok(!existsSync(path.join(eng, n)), n);
    assert.equal(f.engine.view().title, '测试引擎');
    f.store.data.quant.importHoldings = true;
    await f.engine.start();
    assert.equal(f.engine.view().status, 'running');
    assert.deepEqual(f.probes[0], ['pkg_a'], 'probes the packages the adapter declares');
    const child = f.children[0];
    assert.deepEqual(child.args, ['run.py']); assert.equal(child.opts.cwd, eng); assert.equal(child.opts.env.PYTHONDONTWRITEBYTECODE, '1');
    const cfg = JSON.parse(await readFile(path.join(eng, 'settings.json'), 'utf8'));
    assert.deepEqual([cfg.bind, cfg.listen, cfg.login, cfg.notify, cfg.llm_key, cfg.llm_url, cfg.llm_model, cfg.mode], ['127.0.0.1', 18123, 'willbuddy', false, 'WB-KEY', 'https://api.example.com/v1', 'm-1', 'value']);
    assert.deepEqual(cfg.book, {pos: 30500}, 'importOnce section imported on first start');
    assert.ok(!('secret_key' in cfg) && cfg.pwd !== 'SRC-PWD', 'credential-like source keys dropped');
    assert.ok(cfg.pwd.length >= 20 && f.store.data.quant.adminSealed === 'S:' + cfg.pwd, 'random local login, sealed in the store');
    assert.ok(!JSON.stringify(f.engine.view()).includes(cfg.pwd));
    const login = JSON.parse(f.calls.find(c => c.path === '/auth').body);
    assert.deepEqual(Object.keys(login), ['u', 'p']);
    const pool = await f.engine.handle({action: 'pool'});
    assert.deepEqual(pool.pool.map(p => [p.code, p.name]), [['600438', '示例股份']], 'invalid codes dropped');
    assert.equal(f.calls.filter(c => c.path === '/auth').length, 2, 'a 401 re-logs in once');
    assert.equal(f.calls.filter(c => c.path === '/list').at(-1).cookie, 'sid=s2');
    const s1 = await f.engine.handle({action: 'signal', code: 'sh600438'});
    assert.equal(s1.summary.score, 34); assert.equal(s1.summary.name, '示例股份'); assert.ok(s1.charts.price && s1.charts.curve);
    await f.engine.handle({action: 'signal', code: '600438'});
    assert.equal(f.calls.filter(c => c.path === '/s/600438').length, 1, 'cached for 2 minutes');
    await f.engine.handle({action: 'signal', code: '600438', fresh: true});
    assert.equal(f.calls.filter(c => c.path === '/s/600438').length, 2);
    assert.equal(f.store.data.quant.pool[0].last.action, 'HOLD');
    await f.engine.handle({action: 'addStock', code: '002459', name: '示例二'});
    assert.deepEqual(JSON.parse(f.calls.find(c => c.path === '/pool/add').body), {uid: 7, sym: '002459', label: '示例二'});
    await f.engine.handle({action: 'removeStock', code: '002459'});
    assert.deepEqual(JSON.parse(f.calls.find(c => c.path === '/pool/del').body), {uid: 7, sym: '002459'});
    const ins = await f.engine.handle({action: 'insight', code: '600438'});
    assert.deepEqual(ins, {available: false, text: '【算法结论】暂停买入', reason: '未配置'});
    assert.ok(f.calls.some(c => c.path === '/ai/600438?uid=7'));
    await assert.rejects(f.engine.handle({action: 'signal', code: 'abc'}), /6 位/);
    await f.engine.stop();
    assert.deepEqual(child.killed, ['SIGTERM']); assert.equal(f.engine.view().status, 'stopped');
    await writeFile(path.join(eng, 'settings.json'), JSON.stringify({...cfg, book: {pos: 100}}));
    await f.engine.start();
    assert.deepEqual(JSON.parse(await readFile(path.join(eng, 'settings.json'), 'utf8')).book, {pos: 100}, 'engine-owned section kept on restart');
    await f.engine.stop();
  } finally { await f.cleanup(); }
});

test('engine: no adapter, missing packages, missing endpoint give clear errors', async () => {
  const none = await fixture({adapter: null});
  try { await assert.rejects(none.engine.sync({source: none.src}), /wb-engine\.json/); await assert.rejects(none.engine.sync({}), /选择/); } finally { await none.cleanup(); }
  const f = await fixture({pythonOk: false});
  try {
    await f.engine.sync({source: f.src});
    await assert.rejects(f.engine.start(), /pkg_a/);
    assert.equal(f.engine.view().status, 'error'); assert.equal(f.children.length, 0, 'nothing spawned without the packages');
  } finally { await f.cleanup(); }
  const g = await fixture({adapter: {...ADAPTER, endpoints: {pool: '/list', signal: '/s/{code}'}}});
  try { await g.engine.sync({source: g.src}); await assert.rejects(g.engine.handle({action: 'insight', code: '600438'}), /没有提供该功能/); await g.engine.stop(); } finally { await g.cleanup(); }
  assert.deepEqual(probePython(''), {ok: false, missing: ['python'], error: '没有找到 Python'});
  let code = '';
  const fake = (py, args) => { code = args[1]; return {stdout: '{"v":"3.13.1","m":["pkg_b"]}\n'}; };
  assert.deepEqual(probePython('/x/python3', ['pkg_a', 'pkg_b', 'bad name'], fake), {ok: false, version: '3.13.1', missing: ['pkg_b']});
  assert.match(code, /\["pkg_a","pkg_b"\]/);
});

test('page, detail and forms', () => {
  const action = (l, a, id = '', c = 'secondary') => `<button class="${c}" data-action="${a}" data-id="${id}">${l}</button>`;
  const heading = (k, t, d, x = '', stats = []) => `<h1>${t}</h1>${stats.map(([n, l]) => `<b class="st">${n}</b>${l}`).join('')}${x}`, empty = t => `<div class="empty">${t}</div>`, date = () => '今天';
  const state = {quant: {status: 'running', installed: true, title: '我的<策略>', source: '/src', files: 300, pool: [{code: '600438', name: '<b>示例</b>', last: {action: 'BUY', actionText: '', score: 72.5, multiplier: 1.5, price: 11.2, changePct: 2.1, at: 1}}, {code: '002459', name: '示例二'}]}};
  const doc = new JSDOM(quantPage(state, {action, heading, empty, date})).window.document;
  assert.equal(doc.querySelectorAll('.quant-stock').length, 2); assert.equal(doc.querySelector('.quant-stock h3').textContent, '<b>示例</b>');
  assert.equal(doc.querySelector('.quant-engine h3').textContent, '我的<策略>');
  assert.equal(doc.querySelector('.q-action').textContent, '买入');
  assert.deepEqual([...doc.querySelectorAll('b.st')].map(b => b.textContent), ['2', '1', '0']);
  const stopped = new JSDOM(quantPage({quant: {status: 'stopped', pool: [], installed: false}}, {action, heading, empty, date})).window.document;
  assert.ok(stopped.querySelector('[data-action="quantStart"]')); assert.match(stopped.querySelector('[data-action="quantSync"]').textContent, /导入/);
  assert.ok(new JSDOM(quantPage(state, {action, heading, empty, date, open: '600438'})).window.document.querySelector('#quantLoading'));
  const detail = {summary: summarize(ADAPTER, '600438', RAW, QUOTE), charts: chartGrids(ADAPTER, RAW), at: 1};
  const d = new JSDOM(quantPage(state, {action, heading, empty, date, open: '600438', detail})).window.document;
  assert.equal(d.querySelector('.q-hero .q-action').textContent, '暂停买入'); assert.match(d.querySelector('.q-kpi em').textContent, /调整前 53.5/);
  assert.equal(d.querySelector('#quantCharts').dataset.code, '600438'); assert.equal(d.querySelectorAll('.q-table').length, 1); assert.ok(d.querySelector('.qf-row .qf-bar') && d.querySelector('.qi-grid .qi')); // [F1e] factor and indicator cards
  assert.match(d.body.textContent, /本机私有引擎/);
  assert.match(new JSDOM(quantPage(state, {action, heading, empty, date, open: '600438', detail: {error: '<i>x</i>'}})).window.document.querySelector('.task-error').textContent, /<i>x<\/i>/);
  assert.deepEqual(quantDashboards('600438', detail.charts), [], '[v46] price/score block removed; return chart is inline SVG');
  assert.ok(d.querySelector('.q-return svg.q-return-svg')); assert.match(d.querySelector('.q-return h3').textContent, /收益率/);
  assert.doesNotMatch(d.body.innerHTML, /行数据/);
  const fd = o => { const x = new FormData(); for (const [k, v] of Object.entries(o)) x.append(k, v); return x; };
  assert.deepEqual(quantAddPayload(fd({code: ' 600438 ', name: ''})), {action: 'addStock', code: '600438', name: ''});
  assert.deepEqual(quantSettingsPayload(fd({python: '/p', ai: 'none', autoStart: 'on'})), {action: 'settings', python: '/p', ai: 'none', autoStart: true, importHoldings: false});
  assert.match(quantSettingsForm({source: '/a<b'}), /\/a&lt;b/);
});

test('app tools: status, signal, scan, insight, pool changes need confirmation, open', async () => {
  const names = appToolDefinitions().map(d => d.function.name);
  for (const n of ['app_quant_status', 'app_quant_signal', 'app_quant_scan', 'app_quant_insight', 'app_quant_pool_add', 'app_quant_pool_remove', 'app_quant_open']) assert.ok(names.includes(n), n);
  assert.match(appToolContext(), /app_quant_/);
  const seen = [], opened = [];
  const quant = {view: () => ({status: 'running', source: '/s', pool: [{code: '600438', name: '示例', last: {action: 'HOLD', score: 34, at: Date.UTC(2026, 10, 20, 3)}}]}),
    handle: async p => { seen.push(p); if (p.action === 'signal') return {summary: {code: '600438', score: 34}, charts: {ops: [{date: 'd'}]}, at: 1}; if (p.action === 'refreshAll') return {results: [{code: '600438', name: '示例', action: 'HOLD', reasons: ['r']}, {code: '1', error: 'x'}]}; if (p.action === 'insight') return {available: true, text: 't'}; return {pool: [{code: p.code, name: 'n'}]}; }};
  const run = (name, args = {}, answer = true) => executeAppTool(name, args, {store: {data: {}}, deps: {quant, openQuant: c => opened.push(c), notify() {}}, ask: async () => answer});
  const st = await run('app_quant_status'); assert.equal(st.engine, 'running'); assert.equal(st.pool[0].action, 'HOLD');
  const sig = await run('app_quant_signal', {code: '600438', fresh: true}); assert.equal(sig.signal.score, 34); assert.match(sig.note, /不构成投资建议/);
  assert.deepEqual(seen.at(-1), {action: 'signal', code: '600438', fresh: true});
  const scan = await run('app_quant_scan'); assert.equal(scan.results[0].reason, 'r'); assert.equal(scan.results[1].error, 'x');
  assert.equal((await run('app_quant_insight', {code: '600438'})).text, 't');
  assert.equal((await run('app_quant_pool_add', {code: '002459'}, false)).status, 'denied'); assert.ok(!seen.some(p => p.action === 'addStock'));
  assert.equal((await run('app_quant_pool_add', {code: '002459', name: '示例二'})).status, 'succeeded');
  await run('app_quant_open', {code: '600438'}); await run('app_quant_open', {}); assert.deepEqual(opened, ['600438', '']);
});

test('wiring, and the public code carries no strategy-specific names', async () => {
  const read = p => readFile(new URL(p, import.meta.url), 'utf8');
  const files = ['../main.mjs', '../src/app.js', '../services/conversation.mjs', '../src/ui/sidebar.js', '../preload.cjs', '../src/shared/quant.js', '../services/quant-engine.mjs', '../src/ui/quant.js', '../services/app-tools.mjs', './acceptance/quant-engine-live.mjs', '../../docs/plans/QUICK_QUANT_PLAN.md'];
  const [main, app, conv, sidebar, preload, ...rest] = await Promise.all(files.map(read));
  assert.match(main, /register\('quant'/); assert.match(main, /quant:_quant,\.\.\.publicData/); assert.match(main, /quant\?\.stop\(\)/); assert.match(main, /get quant\(\) \{ return quant; \}/);
  assert.match(app, /if \(page === 'quant'\)/); assert.match(app, /quantDashboards\(qc\.dataset\.code/);
  assert.doesNotMatch(sidebar, /\{id: 'quant'/); // [fin1] the quant page is reached from the 工作台 panel assert.match(conv, /QUANT_INTENT\.test\(prompt\)/); assert.match(preload, /'quant'/);
  const banned = new RegExp([['stock', 'widget'].join('-'), ['WorkBuddy', '2026-09'].join('/'), ['ind', 'gate'].join('_'), ['score_before', 'gate'].join('_'), ['ml', 'meta'].join('_'), ['cost', 'harvest'].join('_'), ['smart_return', 'pct'].join('_'), ['light', 'gbm'].join(''), ['scikit', 'learn'].join('-')].join('|'), 'i');
  files.forEach((name, i) => { const t = [main, app, conv, sidebar, preload, ...rest][i]; const m = banned.exec(t); assert.equal(m, null, `${name}: ${m?.[0]}`); });
});
