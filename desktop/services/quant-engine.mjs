// [q1] Local private quant engine: the user's own strategy project, run as a child process on 127.0.0.1.
// Everything project-specific comes from wb-engine.json in that project (see src/shared/quant.js), so this file carries
// no strategy details. QuanK writes the engine's config (random local login, no push, AI gateway from QuanK's model
// settings), keeps the session cookie in this process only, and exposes generic summaries to the renderer and chat tools.
import { spawn as nodeSpawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { cp, mkdir, readFile, writeFile, stat, open, rm, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolveStock } from './stock-lookup.mjs'; // [v45q]
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { normalizeCode, summarize, chartGrids, syncIncluded, normalizeAdapter, fill, fillDeep, pick, ADAPTER_FILE, normalizeWatch, parseWatch, describeWatch, cstClock, isTradingTime, actionTone, summarizeHolding, holdingTotals, parseTrade, summarizePlan, planOptions, parsePlan, engineFeatures, normalizeReports, summarizeReport, reportDefsView, normalizeReportAuto, parseReportAuto, describeReportAuto, sparkSeries } from '../src/shared/quant.js';

const SIGNAL_TTL = 120e3, LOG_BYTES = 2 * 1024 * 1024, ENGINE_USER = 'willbuddy';
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const home = p => String(p || '').replace(/^~(?=\/|$)/, os.homedir());
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const PYTHON_CANDIDATES = ['/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3'];

export async function freePort() {
  return new Promise((resolve, reject) => { const s = createServer(); s.unref(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const {port} = s.address(); s.close(() => resolve(port)); }); });
}

/** Check that a Python runs and can import the packages the engine declares. Returns {ok, version, missing[]}. */
export function probePython(python, requires = [], run = spawnSync) {
  if (!python) return {ok: false, missing: ['python'], error: '没有找到 Python'};
  const mods = (Array.isArray(requires) ? requires : []).filter(m => /^[A-Za-z_][\w.]*$/.test(m));
  const code = `import sys,importlib,json\nm=[]\nfor n in ${JSON.stringify(mods)}:\n  try: importlib.import_module(n)\n  except Exception: m.append(n)\nprint(json.dumps({"v":sys.version.split()[0],"m":m}))`;
  try {
    const r = run(python, ['-c', code], {encoding: 'utf8', timeout: 30000, env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
    const o = JSON.parse(String(r.stdout || '').trim().split('\n').pop() || '{}');
    return {ok: Array.isArray(o.m) && !o.m.length, version: o.v || '', missing: o.m || ['python']};
  } catch (e) { return {ok: false, missing: ['python'], error: clip(e.message, 160)}; }
}

/** [q5] Run `python <script> ...args` in cwd without a shell; resolves {code, tail} (last 4 KB of output). */
export function runPythonScript({python, cwd, script, args = [], timeoutMs = 600e3, spawnFn = nodeSpawn}) {
  return new Promise(resolve => {
    let tail = '', done = false, c;
    const fin = code => { if (done) return; done = true; clearTimeout(timer); resolve({code, tail}); };
    const timer = setTimeout(() => { tail += '\n超时'; try { c?.kill('SIGKILL'); } catch {} fin(-1); }, timeoutMs);
    try { c = spawnFn(python, [script, ...args], {cwd, env: {...process.env, PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1', TZ: 'Asia/Shanghai'}, stdio: ['ignore', 'pipe', 'pipe']}); }
    catch (e) { tail = String(e.message); fin(-1); return; }
    const keep = b => { tail = (tail + String(b)).slice(-4000); };
    c.stdout?.on('data', keep); c.stderr?.on('data', keep);
    c.on('error', e => { keep(e.message); fin(-1); });
    c.on('exit', code => fin(code ?? -1));
  });
}

export function createQuantEngine({dir, store, seal = s => s, unseal = s => s, aiGateway = () => null, notify = () => {}, onAlert = () => {}, now = Date.now,
  spawn = nodeSpawn, fetcher = globalThis.fetch, probe = probePython, exists = existsSync, port: pickPort = freePort, chooseFolder = null, runScript = null, lookup = null}) {
  const engineDir = path.join(dir, 'engine'), logPath = path.join(dir, 'engine.log');
  const st = () => (store.data.quant ??= {source: '', python: '', autoStart: true, ai: 'willbuddy', pool: []});
  let child = null, base = '', cookie = '', status = 'stopped', error = '', starting = null, uid = null, adapter = null;
  const cache = new Map();
  const set = (s, e = '') => { status = s; error = e; notify(); };

  async function readAdapter(folder) {
    let raw;
    try { raw = await readFile(path.join(folder, ADAPTER_FILE), 'utf8'); } catch { throw new Error(`这个文件夹里没有 ${ADAPTER_FILE}（私有引擎描述文件），不能作为量化引擎导入`); }
    let j;
    try { j = JSON.parse(raw); } catch { throw new Error(`${ADAPTER_FILE} 不是有效的 JSON`); }
    return normalizeAdapter(j);
  }
  async function ensureAdapter() { if (!adapter) { adapter = await readAdapter(engineDir); const s = st(); s.features = engineFeatures(adapter); s.planOptions = planOptions(adapter); s.reportDefs = reportDefsView(adapter); } return adapter; }
  async function tail(n = 4000) {
    try { const h = await open(logPath, 'r'); const {size} = await h.stat(); const b = Buffer.alloc(Math.min(n, size)); await h.read(b, 0, b.length, size - b.length); await h.close(); return b.toString('utf8'); } catch { return ''; }
  }
  function python() {
    const s = st();
    return s.python || [...(adapter?.engine?.python || []).map(home), ...PYTHON_CANDIDATES].find(p => exists(p)) || '';
  }

  /** [v0.52.1] The strategy project changed after the last sync (entry file or adapter newer than lastSync). */
  async function sourceChanged() {
    const s = st();
    if (!s.source || !s.lastSync) return false;
    try {
      let entry = ''; try { entry = JSON.parse(await readFile(path.join(s.source, ADAPTER_FILE), 'utf8'))?.engine?.entry || ''; } catch {}
      for (const f of [typeof entry === 'string' && !entry.includes('..') ? entry : '', ADAPTER_FILE]) { if (!f) continue; const t = await stat(path.join(s.source, f)); if (t.mtimeMs > s.lastSync + 1000) return true; }
    } catch { return false; }
    return false;
  }
  async function sync({source} = {}) {
    const s = st(), src = source || s.source;
    if (!src) throw new Error('请先选择你的策略项目文件夹');
    const abs = path.resolve(src), ad = await readAdapter(abs);
    if (!exists(path.join(abs, ad.engine.entry))) throw new Error(`项目里没有入口文件 ${ad.engine.entry}`);
    if (status === 'running' || status === 'starting') await stop();
    await mkdir(engineDir, {recursive: true});
    const extra = [...(Array.isArray(ad.sync?.exclude) ? ad.sync.exclude : []), `^${escapeRe(ad.config?.file || 'config.json')}$`];
    let copied = 0;
    await cp(abs, engineDir, {recursive: true, force: true, filter: p => { const rel = path.relative(abs, p); if (!rel) return true; const ok = syncIncluded(rel.split(path.sep).join('/'), extra); if (ok) copied++; return ok; }});
    adapter = ad; s.source = abs; s.lastSync = now(); s.files = copied; s.title = clip(ad.title, 40); s.features = engineFeatures(ad); s.planOptions = planOptions(ad); s.reportDefs = reportDefsView(ad);
    await store.save?.(); cache.clear(); notify();
    return {source: abs, files: copied};
  }

  /** Engine config: keys from the adapter's `set` are ours; options from the source project are kept minus anything that
   *  looks like a credential; `importOnce` sections (e.g. holdings) are imported once, then owned by the engine. */
  async function writeConfig(port) {
    const ad = await ensureAdapter(), C = ad.config || {}, s = st(), name = C.file || 'config.json', file = path.join(engineDir, name);
    let current = {}, source = {};
    try { current = JSON.parse(await readFile(file, 'utf8')); } catch {}
    try { source = JSON.parse(await readFile(path.join(s.source, name), 'utf8')); } catch {}
    if (!s.adminSealed) { s.adminSealed = seal(randomBytes(18).toString('base64url')); await store.save?.(); }
    let drop; try { drop = new RegExp(C.dropFromSource || 'key|pass|secret|token', 'i'); } catch { drop = /key|pass|secret|token/i; }
    const once = Array.isArray(C.importOnce) ? C.importOnce : [];
    const keep = Object.fromEntries(Object.entries(source).filter(([k]) => !drop.test(k) && !once.includes(k)));
    const imported = Object.fromEntries(once.filter(k => current[k] === undefined && s.importHoldings && source[k] !== undefined).map(k => [k, source[k]]));
    const ai = s.ai === 'none' ? null : aiGateway();
    const vars = {host: '127.0.0.1', port, user: ENGINE_USER, pass: unseal(s.adminSealed), ai: {key: ai?.key || '', baseUrl: ai?.baseUrl || '', model: ai?.model || ''}};
    await writeFile(file, JSON.stringify({...keep, ...current, ...imported, ...fillDeep(C.set || {}, vars)}, null, 2));
    await chmod(file, 0o600).catch(() => {});
  }

  async function start() {
    if (status === 'running') return view();
    if (starting) return starting;
    starting = (async () => {
      const s = st();
      if (!exists(path.join(engineDir, ADAPTER_FILE))) { if (!s.source) { set('error', '请先导入策略项目'); throw new Error(error); } await sync({}); }
      else if (await sourceChanged()) { try { const r = await sync({}); store.log?.('策略代码已自动同步', `策略项目有更新，启动前已同步 ${r.files} 个文件`); } catch {} } // [v0.52.1]
      const ad = await ensureAdapter();
      const py = python(), check = probe(py, ad.engine.requires || []);
      if (!check.ok) { set('error', check.error || `Python 缺少：${check.missing.join('、')}。请在量化设置里选择装好引擎依赖的 Python`); throw new Error(error); }
      const port = await pickPort();
      await writeConfig(port);
      try { const t = await stat(logPath); if (t.size > LOG_BYTES) await rm(logPath, {force: true}); } catch {}
      const log = await open(logPath, 'a');
      set('starting');
      child = spawn(py, [ad.engine.entry], {cwd: engineDir, env: {...process.env, PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1', TZ: 'Asia/Shanghai'}, stdio: ['ignore', log.fd, log.fd], detached: false});
      const me0 = child;
      child.on('exit', code => { log.close().catch(() => {}); if (child === me0) { child = null; cookie = ''; base = ''; if (status !== 'stopped') set('error', `引擎已退出（代码 ${code}）`); } });
      base = `http://127.0.0.1:${port}`;
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (!child) throw new Error(error || '引擎启动失败');
        try { const r = await fetcher(base + (ad.engine.health || '/'), {signal: AbortSignal.timeout(2000)}); if (r.status < 500) break; } catch {}
        if (i === 119) { await stop(); set('error', '引擎 60 秒内没有就绪，请查看日志'); throw new Error(error); }
      }
      await login();
      s.port = port; set('running');
      return view();
    })();
    try { return await starting; } catch (e) { if (status !== 'error') set('error', e.message); throw e; } finally { starting = null; }
  }

  async function stop() {
    const c = child; child = null; cookie = ''; base = ''; uid = null;
    if (c) { c.kill('SIGTERM'); await new Promise(r => { const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch {} r(); }, 3000); c.once('exit', () => { clearTimeout(t); r(); }); }); }
    set('stopped');
    return view();
  }

  async function login() {
    const A = adapter.auth, body = {[A.user || 'username']: ENGINE_USER, [A.pass || 'password']: unseal(st().adminSealed)};
    const r = await fetcher(base + A.path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(15000)});
    const setCookie = r.headers.getSetCookie?.() || [r.headers.get('set-cookie')].filter(Boolean);
    cookie = setCookie.map(c => c.split(';')[0]).join('; ');
    const j = await r.json().catch(() => ({}));
    if (!r.ok || (A.okPath && !pick(j, A.okPath))) throw new Error('引擎登录失败：' + clip(j.error || r.status, 80));
    uid = A.userIdPath ? pick(j, A.userIdPath) ?? null : null;
  }

  async function call(p, {method = 'GET', body, timeoutMs = 120000, retry = true, signal} = {}) {
    if (status !== 'running') { if (st().autoStart !== false) await start(); else throw new Error('量化引擎没有运行，请先在「量化」页启动'); }
    const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    let r;
    try { r = await fetcher(base + p, {method, headers: {'Content-Type': 'application/json', Cookie: cookie}, body: body === undefined ? undefined : JSON.stringify(body), signal: sig}); }
    catch (e) { throw new Error(sig.aborted ? '量化引擎响应超时' : '无法连接量化引擎：' + clip(e.message, 80)); }
    if (r.status === 401 && retry) { await login(); return call(p, {method, body, timeoutMs, retry: false, signal}); }
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(clip(data?.error || `量化引擎返回 ${r.status}`, 200));
    return data;
  }

  /** Call one of the adapter's named endpoints with {code}/{uid}/{name} placeholders. */
  async function ep(name, vars = {}, opts = {}) {
    const ad = await ensureAdapter(), e = ad.endpoints?.[name];
    if (!e) throw new Error('这个引擎没有提供该功能');
    if (status !== 'running' && st().autoStart !== false) await start();
    const v = {uid: uid ?? 1, ...vars}, p = typeof e === 'string' ? e : e.path, method = typeof e === 'string' ? 'GET' : (e.method || (e.body ? 'POST' : 'GET'));
    return call(fill(p, v, encodeURIComponent), {...opts, method, body: typeof e === 'object' && e.body ? fillDeep(e.body, v) : undefined});
  }

  async function signal(code, {fresh = false, signal: abort} = {}) {
    const c = normalizeCode(code), hit = cache.get(c);
    if (!fresh && hit && now() - hit.at < SIGNAL_TTL) return hit;
    const ad = await ensureAdapter();
    const [raw, quote] = await Promise.all([ep('signal', {code: c}, {timeoutMs: 180000, signal: abort}), ad.endpoints.quote ? ep('quote', {code: c}, {signal: abort}).catch(() => null) : null]);
    const entry = {at: now(), raw, quote, summary: summarize(ad, c, raw, quote)};
    cache.set(c, entry);
    const p = st().pool.find(x => x.code === c);
    if (p) { p.name = entry.summary.name || p.name; p.spark = sparkSeries(ad, raw); if (!p.spark.length) delete p.spark; p.last = {at: entry.at, action: entry.summary.action, actionText: entry.summary.actionText, score: entry.summary.score, multiplier: entry.summary.multiplier, price: entry.summary.price, changePct: entry.summary.changePct, date: entry.summary.date}; await store.save?.(); notify(); }
    return entry;
  }

  async function pool() {
    const ad = await ensureAdapter(), F = ad.fields || {}, r = await ep('pool'), rows = pick(r, F.poolList || 'stocks');
    const list = (Array.isArray(rows) ? rows : []).map(x => ({code: String(pick(x, F.poolCode || 'code') ?? ''), name: clip(pick(x, F.poolName || 'name'), 30)})).filter(x => /^\d{6}$/.test(x.code));
    const s = st(), prev = new Map((s.pool || []).map(p => [p.code, p]));
    s.pool = list.map(x => ({...prev.get(x.code), ...x}));
    await store.save?.(); notify();
    return s.pool;
  }

  // [q3] watching the pool: a full scan records action changes (and, before the open, a digest) and raises onAlert
  const ALERT_LIMIT = 200;
  function pushAlert(a) { const s = st(); s.alerts = [{id: `${a.kind}-${a.time}-${a.code || 'pool'}`, ...a}, ...(s.alerts || [])].slice(0, ALERT_LIMIT); }
  async function scanAll(kind = 'watch') {
    const s = st(), out = [], changes = [];
    for (const p of [...(s.pool || [])]) {
      const prev = p.last?.action || '';
      try {
        const x = (await signal(p.code, {fresh: true})).summary;
        out.push(x);
        if (prev && x.action && prev !== x.action)
          changes.push({kind: 'change', time: now(), code: p.code, name: x.name || p.name || '', from: prev, to: x.action, toText: x.actionText, score: x.score, multiplier: x.multiplier, price: x.price, changePct: x.changePct, reason: clip(x.reasons?.[0], 120)});
      } catch (e) { out.push({code: p.code, name: p.name, error: clip(e.message, 160)}); }
    }
    for (const c of changes) pushAlert(c);
    let digest = null;
    if (kind === 'premarket') {
      const ok = out.filter(x => !x.error);
      digest = {kind: 'digest', time: now(), counts: {total: out.length, buy: ok.filter(x => actionTone(x.action) === 'buy').length, sell: ok.filter(x => actionTone(x.action) === 'sell').length, failed: out.length - ok.length},
        items: ok.slice(0, 30).map(x => ({code: x.code, name: x.name, action: x.action, actionText: x.actionText, score: x.score, multiplier: x.multiplier, price: x.price, changePct: x.changePct}))};
      pushAlert(digest);
    }
    s.watchError = out.length && out.every(x => x.error) ? out[0].error : '';
    await store.save?.(); notify();
    for (const c of changes) { try { onAlert(c); } catch {} }
    if (digest) { try { onAlert(digest); } catch {} }
    return {kind, results: out, changes, digest};
  }
  let watching = false;
  /** Called every second by the main process; does nothing unless a scan is due. */
  async function tick() {
    const rep = await reportTick().catch(() => null); // [q5] after-close reports
    if (rep) return rep;
    const s = st(), w = normalizeWatch(s.watch);
    if (watching || !w.enabled || !s.source || !(s.pool || []).length) return null;
    const t = now(), c = cstClock(t);
    let kind = null;
    if (w.premarket && c.weekday && c.minutes >= w.premarketMinutes && c.minutes < 570 && s.lastPremarket !== c.day) { s.lastPremarket = c.day; kind = 'premarket'; }
    else if (isTradingTime(t) && t - (s.lastWatch || 0) >= w.interval * 60e3) kind = 'watch';
    if (!kind) return null;
    s.lastWatch = t; watching = true;
    try { await store.save?.(); return await scanAll(kind); } finally { watching = false; }
  }

  // [q4] holdings & investment plan (read from / recorded in the engine; summaries kept locally for the cards)
  const today = () => cstClock(now()).day;
  const lastPrice = code => cache.get(code)?.summary?.price ?? st().pool.find(p => p.code === code)?.last?.price ?? null;
  async function holdingFor(code) {
    const ad = await ensureAdapter();
    if (!ad.endpoints?.position) return null;
    const h = summarizeHolding(ad, code, await ep('position', {code}), lastPrice(code));
    const s = st(); s.holdings = {...(s.holdings || {}), [code]: {...h, log: h.log.slice(0, 10), at: now()}};
    return h;
  }
  async function plan() {
    const ad = await ensureAdapter();
    if (!ad.endpoints?.plan) throw new Error('这个引擎没有提供定投计划');
    const pl = summarizePlan(ad, await ep('plan'));
    st().plan = pl;
    return {plan: pl, options: planOptions(ad)};
  }

  // [q5] engine reports: run the engine's own analysis scripts locally (on demand, or on weekdays after the close)
  const REPORT_TIMEOUT = 600e3;
  let reporting = false;
  const reportDir = path.join(dir, 'reports'), runScriptFn = runScript || (o => runPythonScript({...o, spawnFn: spawn}));
  const inside = rel => { const root = path.resolve(engineDir), p = path.resolve(root, rel); if (!p.startsWith(root + path.sep)) throw new Error('报告路径无效'); return p; };
  async function runReport(id, {date} = {}) {
    const ad = await ensureAdapter(), def = normalizeReports(ad.reports).find(d => d.id === id);
    if (!def) throw new Error('这个引擎没有这份报告');
    const t = today(), d = date ? String(date).trim() : t;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > t) throw new Error('日期需要是 YYYY-MM-DD，且不晚于今天');
    if (!exists(path.join(engineDir, def.script))) throw new Error(`引擎目录里没有 ${def.script}，请先从源目录同步`);
    const py = python(), check = probe(py, ad.engine.requires || []);
    if (!check.ok) throw new Error(check.error || `Python 缺少：${check.missing.join('、')}`);
    const vars = {date: d, today: t}, s = st(), started = now(), out = {id, title: def.title, at: started, date: d, ok: false};
    try {
      const r = await runScriptFn({python: py, cwd: engineDir, script: def.script, args: def.args.map(a => fill(a, vars)), timeoutMs: REPORT_TIMEOUT});
      if (r.code !== 0) throw new Error(`分析脚本退出（代码 ${r.code}）：${clip(r.tail, 200)}`);
      let raw;
      try { raw = JSON.parse(await readFile(inside(fill(def.output, vars)), 'utf8')); } catch { throw new Error('分析脚本没有生成可读的结果文件'); }
      Object.assign(out, summarizeReport(def, raw), {ok: true, ms: now() - started});
      if (def.markdown) { try { const md = (await readFile(inside(fill(def.markdown, vars)), 'utf8')).slice(0, 60000); await mkdir(reportDir, {recursive: true}); await writeFile(path.join(reportDir, id + '.md'), md); out.hasMarkdown = true; } catch {} }
    } catch (e) { out.error = clip(e.message, 300); }
    s.reports = {...(s.reports || {}), [id]: out};
    if (!out.hasMarkdown) { try { await rm(path.join(reportDir, id + '.md'), {force: true}); } catch {} }
    pushAlert({id: `report-${id}-${started}`, kind: 'report', time: started, reportId: id, title: def.title, ok: out.ok, summary: out.ok ? out.summary : out.error, warnings: out.warnings || []});
    store.log?.(out.ok ? `已生成${def.title}` : `${def.title}生成失败`, out.ok ? clip(out.summary, 120) : out.error);
    await store.save?.(); notify();
    return out;
  }
  async function reportTick() {
    const s = st(), auto = normalizeReportAuto(s.reportAuto);
    if (reporting || !auto.enabled || !s.source) return null;
    const c = cstClock(now());
    if (!c.weekday || c.minutes < auto.minutes || s.lastReportDay === c.day) return null;
    s.lastReportDay = c.day; reporting = true;
    try {
      await store.save?.();
      const results = [];
      for (const d of normalizeReports((await ensureAdapter()).reports).filter(x => x.schedule === 'daily')) results.push(await runReport(d.id));
      for (const r of results) { try { onAlert({kind: 'report', reportId: r.id, title: r.title, ok: r.ok, summary: r.ok ? r.summary : r.error, warnings: r.warnings || []}); } catch {} }
      return {kind: 'reports', results};
    } finally { reporting = false; }
  }

  async function reportView(id) {
    const r = st().reports?.[id];
    if (!r) throw new Error('这份报告还没有生成');
    let md = '';
    if (r.hasMarkdown) { try { md = await readFile(path.join(reportDir, id + '.md'), 'utf8'); } catch {} }
    return {...r, md};
  }

  function view() {
    const s = st();
    return {status, error, title: s.title || '', source: s.source || '', python: s.python || '', pythonFound: python(), autoStart: s.autoStart !== false, ai: s.ai || 'willbuddy',
      importHoldings: !!s.importHoldings, lastSync: s.lastSync || null, features: s.features || engineFeatures(null), reportDefs: s.reportDefs || [], reportAuto: normalizeReportAuto(s.reportAuto), reports: Object.fromEntries(Object.entries(s.reports || {}).map(([k, r]) => [k, {...r}])), planOptions: s.planOptions || [], holdings: s.holdings || {}, plan: s.plan || null, watch: normalizeWatch(s.watch), lastWatch: s.lastWatch || null, watchError: s.watchError || '', alerts: (s.alerts || []).slice(0, 50), logos: s.logos || {}, files: s.files || 0, installed: exists(path.join(engineDir, ADAPTER_FILE)), pool: (s.pool || []).map(p => ({...p}))};
  }

  return {
    view, start, stop, sync, sourceChanged, call, signal, pool, tail, engineDir, tick, scanAll,
    async handle(p = {}) {
      const a = p.action;
      if (a === 'start') return start();
      if (a === 'stop') return stop();
      if (a === 'restart') { await stop(); return start(); }
      if (a === 'syncRestart') { const r = await sync({}); const v = await start(); return {...v, files: r.files}; } // [v0.52.1]
      if (a === 'sync') { const r = await sync({source: p.source}); return {...r, view: view()}; }
      if (a === 'chooseSource') { if (!chooseFolder) throw new Error('当前环境不能选择文件夹'); const f = await chooseFolder(st().source || ''); if (!f) return {cancelled: true}; return {...(await sync({source: f})), view: view()}; }
      if (a === 'settings') {
        const s = st();
        if (typeof p.python === 'string') s.python = p.python.trim();
        if (typeof p.autoStart === 'boolean') s.autoStart = p.autoStart;
        if (['willbuddy', 'none'].includes(p.ai)) s.ai = p.ai;
        if (typeof p.importHoldings === 'boolean') s.importHoldings = p.importHoldings;
        await store.save?.(); notify();
        let requires = [];
        try { requires = (await ensureAdapter()).engine.requires || []; } catch {}
        return {view: view(), python: probe(python(), requires)};
      }
      if (a === 'holding') { const h = await holdingFor(normalizeCode(p.code)); if (!h) throw new Error('这个引擎没有提供持仓功能'); await store.save?.(); notify(); return h; } // [q4]
      if (a === 'holdings') {
        if (!(await ensureAdapter()).endpoints?.position) throw new Error('这个引擎没有提供持仓功能');
        const out = [];
        for (const x of st().pool) { try { out.push(await holdingFor(x.code)); } catch (e) { out.push({code: x.code, error: clip(e.message, 160)}); } }
        await store.save?.(); notify();
        return {holdings: out, totals: holdingTotals(out)};
      }
      if (a === 'record') {
        const ad = await ensureAdapter();
        if (!ad.endpoints?.positionRecord) throw new Error('这个引擎没有提供记录成交的功能');
        const code = normalizeCode(p.code), cur = await holdingFor(code), t = parseTrade(ad, p, cur, today());
        const sides = ad.holdings?.sides || {buy: 'B', sell: 'S'};
        await ep('positionRecord', {...t, side: sides[t.side] ?? t.side});
        cache.delete(code);
        store.log?.(t.side === 'buy' ? '已记录买入' : '已记录卖出', `${code} ${t.shares} 股 @ ${t.price}${t.date ? ' · ' + t.date : ''}`);
        const h = await holdingFor(code);
        await store.save?.(); notify();
        return {trade: t, holding: h};
      }
      if (a === 'plan') { const r = await plan(); await store.save?.(); notify(); return r; }
      if (a === 'reportRun') return runReport(String(p.id || ''), {date: p.date}); // [q5]
      if (a === 'report') return reportView(String(p.id || ''));
      if (a === 'reportAuto') {
        const s = st(), change = parseReportAuto(p), cur = normalizeReportAuto(s.reportAuto);
        s.reportAuto = {enabled: cur.enabled, time: cur.time, ...change};
        await store.save?.(); notify();
        return {auto: normalizeReportAuto(s.reportAuto), text: describeReportAuto(s.reportAuto)};
      }
      if (a === 'planSet') {
        const ad = await ensureAdapter();
        if (!ad.endpoints?.planSet) throw new Error('这个引擎不支持修改定投计划');
        const v = parsePlan(planOptions(ad), p);
        await ep('planSet', v);
        cache.clear();
        const r = ad.endpoints.plan ? await plan() : {plan: null};
        store.log?.('已修改定投计划', r.plan?.label || `${v.type} · ${v.times} 次`);
        await store.save?.(); notify();
        return r;
      }
      if (a === 'watch') { // [q3]
        const s = st(), cur = normalizeWatch(s.watch), change = parseWatch(p);
        s.watch = {enabled: cur.enabled, interval: cur.interval, notify: cur.notify, premarket: cur.premarket, premarketTime: cur.premarketTime, ...change};
        await store.save?.(); notify();
        return {watch: normalizeWatch(s.watch), text: describeWatch(s.watch)};
      }
      if (a === 'scanNow') return scanAll('watch');
      if (a === 'probe') { let requires = []; try { requires = (await ensureAdapter()).engine.requires || []; } catch {} return probe(python(), requires); }
      if (a === 'log') return {text: await tail(p.bytes || 6000)};
      if (a === 'pool') return {pool: await pool()};
      if (a === 'findStock') { if (!lookup) throw new Error('当前环境不能联网查找股票'); return {candidates: (await lookup.find(p.query)).filter(x => x.aShare).slice(0, 8)}; } // [v45q]
      if (a === 'resolveStock') { if (!lookup) throw new Error('当前环境不能联网查找股票'); return resolveStock(lookup, p.query); }
      if (a === 'addStock' || a === 'removeStock') {
        let raw = String(p.code ?? p.query ?? '').trim(), name = p.name;
        if (a === 'addStock' && !/^(?:sh|sz|bj)?\d{6}$/i.test(raw)) { // [v45q] a company name: look up the code first
          if (!lookup) throw new Error('请输入 6 位股票代码');
          const r = await resolveStock(lookup, raw);
          if (r.error) throw new Error(r.error);
          if (r.choices) throw new Error(`找到多只股票：${r.choices.map(c => `${c.name}（${c.code}）`).join('、')}，请输入其中一只的 6 位代码`);
          raw = r.code; name = name || r.name;
        }
        const code = normalizeCode(raw);
        await ep(a === 'addStock' ? 'poolAdd' : 'poolRemove', {code, name: clip(name, 20)});
        cache.delete(code);
        const s = st(); let logo = false;
        if (a === 'removeStock' && s.logos?.[code]) { delete s.logos[code]; await store.save?.(); }
        if (a === 'addStock' && lookup && p.logo !== false && !s.logos?.[code]) {
          const src = await lookup.logo(code).catch(() => '');
          if (src) { s.logos = Object.fromEntries([...Object.entries(s.logos || {}), [code, src]].slice(-80)); logo = true; await store.save?.(); notify(); }
        }
        return {pool: await pool(), code, name: name || '', logo: logo || !!s.logos?.[code]};
      }
      if (a === 'signal') { const e = await signal(p.code, {fresh: !!p.fresh}); let holding = null; try { holding = await holdingFor(e.summary.code); } catch {} return {summary: e.summary, charts: chartGrids(adapter, e.raw), at: e.at, holding}; }
      if (a === 'insight') {
        const ad = await ensureAdapter(), I = ad.insight || {}, r = await ep('insight', {code: normalizeCode(p.code)}, {timeoutMs: 90000});
        return {available: !!pick(r, I.available || 'available'), text: clip(pick(r, I.text || 'text'), 4000), reason: clip(pick(r, I.reason || 'reason'), 200)};
      }
      if (a === 'refreshAll') { const out = []; for (const s of st().pool) { try { out.push((await signal(s.code, {fresh: true})).summary); } catch (e) { out.push({code: s.code, error: clip(e.message, 160)}); } } return {results: out}; }
      throw new Error('未知操作');
    },
  };
}
