// [v0.55.1] 本地引擎固定端口（engine.port）、窄主区域输入框功能只保留图标。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createQuantEngine } from '../services/quant-engine.mjs';
import { normalizeAdapter, ADAPTER_FILE } from '../src/shared/quant.js';

const AD = {title: '本地策略', engine: {entry: 'server.py', health: '/hz', port: 8799}, auth: {path: '/auth'}, endpoints: {pool: '/list', signal: '/s/{code}'}, fields: {},
  config: {file: 'config.json', set: {host: '{host}', port: '{port}'}}};
async function fixture({free = true, adapter = AD, watchError = ''} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'qk-port-')), dir = path.join(root, 'quant'), eng = path.join(dir, 'engine');
  await mkdir(eng, {recursive: true}); await writeFile(path.join(eng, ADAPTER_FILE), JSON.stringify(adapter)); await writeFile(path.join(eng, 'server.py'), '');
  const store = {data: {quant: {source: '', pool: [], autoStart: true, watchError}}, save: async () => {}, log: () => {}};
  const urls = [], children = [], asked = [];
  const fetcher = async url => { urls.push(String(url)); return new Response(JSON.stringify({ok: true}), {status: 200, headers: {'content-type': 'application/json'}}); };
  const spawn = () => { const c = new EventEmitter(); c.kill = () => setTimeout(() => c.emit('exit', 0), 2); children.push(c); return c; };
  const engine = createQuantEngine({dir, store, fetcher, spawn, probe: () => ({ok: true}), port: async () => 51234, portFree: async p => { asked.push(p); return free; },
    exists: p => p.endsWith('python3') || existsSync(p), seal: s => s, unseal: s => s});
  return {eng, engine, urls, children, asked, cleanup: () => rm(root, {recursive: true, force: true})};
}

test('engine.port：策略要求固定端口时按该端口启动并写入配置', async () => {
  const f = await fixture();
  try {
    await f.engine.start();
    assert.equal(f.engine.view().status, 'running');
    assert.deepEqual(f.asked, [8799]);
    assert.ok(f.urls.every(u => u.startsWith('http://127.0.0.1:8799/')), f.urls.join(','));
    assert.equal(JSON.parse(await readFile(path.join(f.eng, 'config.json'), 'utf8')).port, 8799);
  } finally { await f.engine.stop(); await f.cleanup(); }
});

test('引擎启动成功后清除上次的启动失败提示（不再在「运行中」的卡片上显示「引擎已退出（代码 2）」）', async () => {
  const f = await fixture({watchError: '引擎已退出（代码 2）'});
  try { await f.engine.start(); assert.equal(f.engine.view().status, 'running'); assert.equal(f.engine.view().watchError, ''); }
  finally { await f.engine.stop(); await f.cleanup(); }
});

test('engine.port 被占用：明确报错，不启动子进程', async () => {
  const f = await fixture({free: false});
  try {
    await assert.rejects(f.engine.start(), /端口 8799 已被占用/);
    assert.equal(f.children.length, 0);
  } finally { await f.cleanup(); }
});

test('未声明 engine.port 时仍用随机空闲端口；非法端口在描述文件校验时拒绝', async () => {
  const {port, ...engine} = AD.engine;
  const f = await fixture({adapter: {...AD, engine}});
  try { await f.engine.start(); assert.deepEqual(f.asked, []); assert.ok(f.urls[0].startsWith('http://127.0.0.1:51234/')); }
  finally { await f.engine.stop(); await f.cleanup(); }
  assert.throws(() => normalizeAdapter({...AD, engine: {...AD.engine, port: 70000}}), /engine\.port/);
});

test('窄主区域：输入框下方的模式按钮与快捷按钮只显示图标，悬停有文字说明', async () => {
  const css = await readFile(new URL('../src/workbench.css', import.meta.url), 'utf8');
  const b = css.slice(css.indexOf('[v0.55.1]'));
  assert.match(b, /@container qkzone \(max-width:1000px\)\{[\s\S]*\.composer-mode \.cm-label\{display:none\}/);
  assert.match(b, /\.qk-hero \.suggestions \.sg-label\{display:none\}/);
  const composer = await readFile(new URL('../src/ui/composer.js', import.meta.url), 'utf8');
  for (const t of ['计划', '深度研究', '无痕']) assert.ok(composer.includes(`aria-label="${t}"`) && composer.includes(`<span class="cm-label">${t}</span>`), t);
  assert.match(composer, /title="计划模式/);
  const home = await readFile(new URL('../src/ui/home-dashboard.js', import.meta.url), 'utf8');
  assert.match(home, /data-action="suggest" data-id="\$\{id\}" title="\$\{t\}" aria-label="\$\{t\}"/);
});
