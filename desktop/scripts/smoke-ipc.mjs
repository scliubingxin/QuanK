#!/usr/bin/env node
// [F5] Packaged-app smoke check: launches a built QuanK.app with Chromium remote debugging on 127.0.0.1, then from the
// real renderer (real preload bridge, real main-process handlers) checks that every bridged channel exists, calls the
// read-only actions of the investment, portfolio and security features, opens a few pages and takes screenshots.
// It never calls a write action. Usage (QuanK must not be running):
//   node desktop/scripts/smoke-ipc.mjs --app /tmp/qk-smoke/QuanK.app --out /tmp/qk-smoke/out [--port 9333]
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const appPath = args.app || '/Applications/QuanK.app', out = args.out || '/tmp/qk-smoke/out', port = Number(args.port || 9333);
const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Resolve with p, or reject after ms. The timer keeps the event loop alive, so a reply that never comes cannot end the
 *  process early (exit 13, "unsettled top-level await") before the report is written. */
const within = (p, ms, what) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what} 超时（${ms / 1000} 秒）`)), ms); })]).finally(() => clearTimeout(t)); };
const BAD = /缺少此功能接口|拒绝不可信页面|No handler registered|is not a function/;

// read-only calls: [channel, payload, needsNetwork]
const CALLS = [['state', undefined, false], ['security', {action: 'view'}, false], ['security', {action: 'secrets'}, false], ['security', {action: 'egressList'}, false],
  ['security', {action: 'auditList', limit: 5}, false], ['security', {action: 'auditVerify'}, false], ['security', {action: 'review', text: '仅供研究，不构成投资建议。', kind: 'text', record: false}, false],
  ['portfolio', {action: 'view'}, false], ['portfolio', {action: 'overview'}, true], ['knowledge', {action: 'view'}, false], ['knowledge', {action: 'finance', code: '600438'}, true],
  ['research', {action: 'view'}, false], ['research', {action: 'library'}, false], ['market', {action: 'quotes', codes: ['600438']}, true]];
const PAGES = ['security', 'quant', 'feed'];

async function json(url, tries = 60) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return r.json(); } catch {} await sleep(500); }
  throw new Error(`没有连上 ${url}（QuanK 是否已经在运行？请先完全退出 QuanK 再运行冒烟检查）`);
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const wait = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { const {res, rej} = wait.get(m.id); wait.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('调试连接失败')); });
  ws.onclose = () => { for (const {rej} of wait.values()) rej(new Error('调试连接已关闭')); wait.clear(); };
  const send = (method, params = {}, ms = 60000) => within(ready.then(() => new Promise((res, rej) => { const n = ++id; wait.set(n, {res, rej}); ws.send(JSON.stringify({id: n, method, params})); })), ms, method);
  const evaluate = async expr => { const r = await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true}); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  return {send, evaluate, close: () => ws.close()};
}

const report = {app: appPath, started: new Date().toISOString(), channels: {}, calls: [], pages: [], problems: []};
await mkdir(out, {recursive: true});
const preload = await readFile(path.join(here, '..', 'preload.cjs'), 'utf8');
const methods = [...preload.match(/const methods=\[(.*?)\];/s)[1].matchAll(/'(\w+)'/g)].map(m => m[1]);
// the packaged bundle's executable is named by CFBundleExecutable (the offline packager keeps Electron's name)
const plist = await readFile(path.join(appPath, 'Contents', 'Info.plist'), 'utf8').catch(() => '');
const exe = (/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/.exec(plist) || [])[1] || 'Electron';
const bin = path.join(appPath, 'Contents', 'MacOS', exe);
// QuanK allows one instance: a running copy (any location) makes the new one quit right after start
let running = '';
try { running = execFileSync('/bin/ps', ['-axo', 'pid=,command='], {encoding: 'utf8'}).split('\n').filter(l => /QuanK\.app\/Contents\/MacOS\//.test(l) && !l.includes(appPath)).join('\n').trim(); } catch {}
if (running) {
  const msg = `QuanK 正在运行，请先完全退出（⌘Q）再运行冒烟检查：\n${running}`;
  await writeFile(path.join(out, 'smoke-report.json'), JSON.stringify({...report, ok: false, problems: [msg]}, null, 2));
  console.log(JSON.stringify({ok: false, problems: [msg]}, null, 1));
  process.exit(2);
}
const child = spawn(bin, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], {stdio: ['ignore', 'pipe', 'pipe']});
let stderr = ''; child.stderr.on('data', d => { stderr = (stderr + d).slice(-4000); });
try {
  const ver = await json(`http://127.0.0.1:${port}/json/version`);
  report.electron = ver.Browser;
  let page = null;
  for (let i = 0; i < 60 && !page; i++) { const list = await json(`http://127.0.0.1:${port}/json/list`); page = list.find(t => t.type === 'page' && /index\.html/.test(t.url)); if (!page) await sleep(500); }
  if (!page) throw new Error('没有找到 QuanK 主窗口');
  const c = cdp(page.webSocketDebuggerUrl);
  await c.send('Page.enable'); await sleep(2500);
  const locked = await c.evaluate(`window.actwill.state().then(s => !!s.locked)`);
  if (locked) throw new Error('QuanK 处于锁定状态，请先关闭应用锁或手动解锁后再运行冒烟检查');
  report.channels = await c.evaluate(`(${JSON.stringify(methods)}).reduce((o, m) => (o[m] = typeof window.actwill?.[m] === 'function', o), {})`);
  const missing = Object.entries(report.channels).filter(([, ok]) => !ok).map(([m]) => m);
  if (missing.length) report.problems.push(`窗口里缺少这些接口：${missing.join('、')}`);
  for (const [ch, payload, net] of CALLS) {
    const t0 = Date.now();
    const r = await c.evaluate(`window.actwill[${JSON.stringify(ch)}](${payload === undefined ? '' : JSON.stringify(payload)}).then(v => ({ok: true, keys: v && typeof v === 'object' ? Object.keys(v.result ?? v).slice(0, 12) : typeof v}), e => ({ok: false, error: String(e && e.message || e).slice(0, 200)}))`);
    const row = {channel: ch, action: payload?.action || '', ms: Date.now() - t0, ...r};
    if (!r.ok && BAD.test(r.error)) report.problems.push(`${ch}.${row.action}：${r.error}`);
    else if (!r.ok && !net) report.problems.push(`${ch}.${row.action}（本机操作）失败：${r.error}`);
    report.calls.push(row);
  }
  for (const p of PAGES) {
    await c.evaluate(`(document.querySelector('[data-page="${p}"]') || {click(){}}).click(), true`);
    await sleep(p === 'quant' ? 6000 : 2500);
    const info = await c.evaluate(`(() => { const t = document.body.innerText; const errs = [...document.querySelectorAll('.task-error')].map(e => e.textContent.trim()).filter(Boolean); return {title: document.querySelector('.plaza-hero h1, h1')?.textContent?.trim() || '', errors: errs.slice(0, 8), bad: /缺少此功能接口|拒绝不可信页面/.test(t), boxes: ['#securityBox', '#portfolioBox', '#knowledgeBox'].filter(s => document.querySelector(s))}; })()`);
    const shot = await c.send('Page.captureScreenshot', {format: 'png'});
    const file = path.join(out, `smoke-${p}.png`); await writeFile(file, Buffer.from(shot.data, 'base64'));
    report.pages.push({page: p, ...info, screenshot: file});
    if (info.bad) report.problems.push(`${p} 页出现「缺少此功能接口」`);
  }
  c.close();
} catch (e) { report.problems.push(`冒烟检查中断：${e.message}`); report.stderr = stderr; }
// the report is written before shutting the app down, so a slow or silent shutdown can never lose it
report.ok = !report.problems.length;
report.finished = new Date().toISOString();
await writeFile(path.join(out, 'smoke-report.json'), JSON.stringify(report, null, 2));
// shut down: ask Electron to close (it may exit without answering), then SIGTERM, then SIGKILL; every wait is bounded
try { const ver = await within(json(`http://127.0.0.1:${port}/json/version`, 2), 5000, 'version'); const b = cdp(ver.webSocketDebuggerUrl); await b.send('Browser.close', {}, 3000).catch(() => {}); b.close(); } catch {}
const exited = () => child.exitCode !== null || child.signalCode !== null;
for (let i = 0; i < 10 && !exited(); i++) await sleep(300);
if (!exited()) { try { child.kill('SIGTERM'); } catch {} for (let i = 0; i < 10 && !exited(); i++) await sleep(300); }
if (!exited()) { try { child.kill('SIGKILL'); } catch {} }
report.shutdown = exited() ? 'clean' : 'killed';
console.log(JSON.stringify({ok: report.ok, problems: report.problems, channels: Object.keys(report.channels).length, calls: report.calls.map(c => `${c.channel}${c.action ? '.' + c.action : ''}:${c.ok ? 'ok' : 'ERR ' + c.error}`), pages: report.pages.map(p => `${p.page}:${p.errors.length ? p.errors.join(' / ') : 'ok'}`)}, null, 1));
process.exit(report.ok ? 0 : 1);
