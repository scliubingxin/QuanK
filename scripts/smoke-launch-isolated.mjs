#!/usr/bin/env node
// Post-package launch check in an isolated data folder. Starts the packaged app with QUANK_SELFTEST=1 and a fresh
// QUANK_USER_DATA, waits for the main window over the debugging port, checks the renderer came up and that the data
// went to the isolated folder, then stops only the process it started. The real data folder is never opened.
//   node scripts/smoke-launch-isolated.mjs <app> [port]
import {spawn} from 'node:child_process';
import {mkdtemp, readdir, rm, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const app = path.resolve(process.argv[2] || ''), port = Number(process.argv[3] || 9351);
const real = path.join(os.homedir(), 'Library', 'Application Support');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const before = (await readdir(real)).length;
const ud = await mkdtemp(path.join('/private/tmp', 'qk108-smoke-ud-'));
const bin = path.join(app, 'Contents', 'MacOS', 'Electron');
const child = spawn(bin, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], {
  env: {...process.env, QUANK_SELFTEST: '1', QUANK_USER_DATA: ud}, stdio: ['ignore', 'ignore', 'pipe']});
let stderr = ''; child.stderr.on('data', d => { stderr = (stderr + d).slice(-2000); });
const result = {ok: false, userData: ud};
try {
  let page;
  for (let i = 0; i < 80 && !page; i++) {
    await sleep(500);
    if (child.exitCode !== null) throw new Error('app exited early: ' + child.exitCode + ' ' + stderr.slice(-300));
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page' && /index\.html/.test(t.url)); } catch {}
  }
  if (!page) throw new Error('main window did not appear in 40 s');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('debug connection failed')); });
  const evaluate = expression => new Promise((res, rej) => {
    const id = Math.floor(Math.random() * 1e9);
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id === id) m.error ? rej(new Error(m.error.message)) : res(m.result?.result?.value); };
    ws.send(JSON.stringify({id, method: 'Runtime.evaluate', params: {expression, awaitPromise: true, returnByValue: true}}));
  });
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) { ready = await evaluate("!!document.querySelector('#prompt') && !!window.actwill"); if (!ready) await sleep(500); }
  result.renderer = ready;
  result.title = await evaluate('document.title');
  ws.close();
  result.isolatedWorkspace = await stat(path.join(ud, 'workspace.json')).then(() => true, () => false);
  result.ok = ready && result.isolatedWorkspace;
} catch (e) { result.error = e.message; }
finally {
  child.kill('SIGTERM'); await sleep(1500); if (child.exitCode === null) child.kill('SIGKILL');
  result.realDataEntries = {before, after: (await readdir(real)).length};
  if (result.realDataEntries.before !== result.realDataEntries.after) { result.ok = false; result.error = 'Application Support changed'; }
  await rm(ud, {recursive: true, force: true});
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
