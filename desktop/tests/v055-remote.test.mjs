// [v0.55] 远程引擎：HTTPS + Bearer 鉴权、密钥不出主进程、本地离线回退。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { JSDOM } from 'jsdom';
import { createQuantEngine, remoteBase, REMOTE_ADAPTER_PATH } from '../services/quant-engine.mjs';
import { quantSettingsForm, quantSettingsPayload, quantPage } from '../src/ui/quant.js';
import { ADAPTER_FILE } from '../src/shared/quant.js';

const ADAPTER = {title: '云端策略', engine: {entry: 'run.py', health: '/hz'}, auth: {path: '/auth', user: 'u', pass: 'p'},
  endpoints: {pool: '/list', signal: '/s/{code}', insight: '/ai/{code}?user_id={uid}'}, fields: {action: 'a', score: 's', poolList: 'rows', poolCode: 'c', poolName: 'n'}};
const json = (b, status = 200) => new Response(JSON.stringify(b), {status, headers: {'content-type': 'application/json'}});

async function fixture({down = false, token = 'TK-1', local = false} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'qk-remote-')), dir = path.join(root, 'quant');
  if (local) { await mkdir(path.join(dir, 'engine'), {recursive: true}); await writeFile(path.join(dir, 'engine', ADAPTER_FILE), JSON.stringify({...ADAPTER, title: '本地策略'})); await writeFile(path.join(dir, 'engine', 'run.py'), ''); }
  const store = {data: {quant: {source: local ? root : '', pool: [], autoStart: true}}, save: async () => {}, log: () => {}};
  const calls = [], children = [];
  const state = {down};
  const fetcher = async (url, o = {}) => {
    const u = new URL(url); calls.push({url: String(url), host: u.host, path: u.pathname, auth: o.headers?.Authorization || '', redirect: o.redirect});
    if (u.hostname === '127.0.0.1' && u.port === '18200') { // local engine
      if (u.pathname === '/hz') return new Response('', {status: 200});
      if (u.pathname === '/auth') return json({ok: true});
      if (u.pathname === '/list') return json({rows: [{c: '600438', n: '本地池'}]});
      return json({error: 'nope'}, 404);
    }
    if (state.down) { const e = new TypeError('fetch failed'); e.cause = {code: 'ECONNREFUSED'}; throw e; }
    if (o.headers?.Authorization !== `Bearer ${token}`) return json({error: 'unauthorized'}, 401);
    if (u.pathname === REMOTE_ADAPTER_PATH) return json({...ADAPTER, user: {id: 42, username: 'alice', role: 'user'}});
    if (u.pathname === '/ai/600519') return json({available: true, text: '云端研判'});
    if (u.pathname === '/hz') return new Response('', {status: 200});
    if (u.pathname === '/list') return json({rows: [{c: '600519', n: '云端池'}]});
    if (u.pathname === '/s/600519') return json({a: 'BUY', s: 71});
    return json({error: 'nope'}, 404);
  };
  const spawn = () => { const c = new EventEmitter(); c.kill = () => setTimeout(() => c.emit('exit', 0), 2); children.push(c); return c; };
  const engine = createQuantEngine({dir, store, fetcher, spawn, probe: () => ({ok: true, version: '3.13'}), port: async () => 18200, seal: s => 'S:' + s, unseal: s => String(s).slice(2), exists: p => p.endsWith('python3') || existsSync(p)});
  return {root, store, engine, calls, children, state, cleanup: () => rm(root, {recursive: true, force: true})};
}

test('remoteBase：只接受 HTTPS（本机 http 例外），端口校验，拒绝地址内嵌账号', () => {
  assert.equal(remoteBase('https://quant.example.com/'), 'https://quant.example.com');
  assert.equal(remoteBase('https://quant.example.com/api/', 8443), 'https://quant.example.com:8443/api');
  assert.equal(remoteBase('http://127.0.0.1:9000'), 'http://127.0.0.1:9000');
  assert.throws(() => remoteBase('http://quant.example.com'), /HTTPS/);
  assert.throws(() => remoteBase('https://a:b@quant.example.com'), /用户名或密码/);
  assert.throws(() => remoteBase('https://quant.example.com', 70000), /端口/);
  assert.throws(() => remoteBase('quant.example.com'), /无效/);
});

test('远程模式：不启动本地 Python，带 Bearer 密钥访问 HTTPS 服务，拒绝跳转；密钥不进入 view', async () => {
  const f = await fixture();
  try {
    const r = await f.engine.handle({action: 'settings', mode: 'remote', remoteUrl: 'https://quant.example.com', remotePort: 8443, remoteToken: 'TK-1', remoteFallback: true});
    assert.equal(r.remote.ok, true); assert.equal(r.remote.title, '云端策略');
    assert.equal(f.store.data.quant.remote.tokenSealed, 'S:TK-1', 'token sealed at rest');
    await f.engine.start();
    const v = f.engine.view();
    assert.equal(v.status, 'running'); assert.equal(v.mode, 'remote'); assert.equal(v.effective, 'remote');
    assert.equal(f.children.length, 0, 'no local Python spawned');
    const pool = await f.engine.pool();
    assert.deepEqual(pool.map(p => p.code), ['600519']);
    const s = await f.engine.signal('600519');
    assert.equal(s.raw.a, 'BUY');
    const remote = f.calls.filter(c => c.host === 'quant.example.com:8443');
    assert.ok(remote.length >= 4);
    assert.ok(remote.every(c => c.auth === 'Bearer TK-1' && c.redirect === 'error' && c.url.startsWith('https://')));
    const ins = await f.engine.handle({action: 'insight', code: '600519'});
    assert.equal(ins.text, '云端研判');
    assert.ok(f.calls.some(c => c.path === '/ai/600519' && c.url.includes('user_id=42')), 'uid comes from the server, not a default');
    const txt = JSON.stringify(f.engine.view());
    assert.ok(!txt.includes('TK-1'), 'token never in view'); assert.equal(v.remote.hasToken, true);
  } finally { await f.engine.stop(); await f.cleanup(); }
});

test('远程模式：密钥错误给出明确提示；保存时拒绝非 HTTPS 地址', async () => {
  const f = await fixture({token: 'RIGHT'});
  try {
    await assert.rejects(f.engine.handle({action: 'settings', mode: 'remote', remoteUrl: 'http://quant.example.com', remoteToken: 'x'}), /HTTPS/);
    const r = await f.engine.handle({action: 'settings', mode: 'remote', remoteUrl: 'https://quant.example.com', remoteToken: 'WRONG'});
    assert.equal(r.remote.ok, false); assert.match(r.remote.error, /密钥/);
    await assert.rejects(f.engine.start(), /鉴权密钥无效/);
  } finally { await f.cleanup(); }
});

test('远程服务器连不上时回退到本地引擎，并在 view 里标记', async () => {
  const f = await fixture({down: true, local: true});
  try {
    await f.engine.handle({action: 'settings', mode: 'remote', remoteUrl: 'https://quant.example.com', remoteToken: 'TK-1', remoteFallback: true});
    await f.engine.start();
    const v = f.engine.view();
    assert.equal(v.status, 'running'); assert.equal(v.fellBack, true); assert.equal(v.effective, 'local');
    assert.equal(f.children.length, 1, 'local engine spawned');
    assert.deepEqual((await f.engine.pool()).map(p => p.code), ['600438']);
  } finally { await f.engine.stop(); await f.cleanup(); }
});

test('关闭回退时，远程不可用直接报错，不启动本地引擎', async () => {
  const f = await fixture({down: true, local: true});
  try {
    await f.engine.handle({action: 'settings', mode: 'remote', remoteUrl: 'https://quant.example.com', remoteToken: 'TK-1', remoteFallback: false});
    await assert.rejects(f.engine.start(), /无法连接远程引擎/);
    assert.equal(f.children.length, 0);
  } finally { await f.cleanup(); }
});

test('设置表单：引擎来源单选、服务器地址/端口/密钥字段，密钥框不回显，payload 字段齐全', () => {
  const html = quantSettingsForm({mode: 'remote', remote: {url: 'https://quant.example.com', port: 8443, hasToken: true, fallback: true}});
  const dom = new JSDOM(`<form>${html}</form>`), fm = dom.window.document.querySelector('form');
  assert.ok(fm.querySelector('input[name="mode"][value="remote"]').checked);
  assert.equal(fm.querySelector('input[name="remoteToken"]').type, 'password');
  assert.equal(fm.querySelector('input[name="remoteToken"]').value, '');
  assert.match(fm.querySelector('input[name="remoteToken"]').placeholder, /已保存/);
  assert.ok(!fm.querySelector('.hint code'), 'hint is one paragraph (flex .hint would split <code> into a column)');
  fm.querySelector('input[name="remoteToken"]').value = 'NEW';
  const p = quantSettingsPayload(new dom.window.FormData(fm));
  assert.deepEqual([p.mode, p.remoteUrl, p.remotePort, p.remoteToken, p.remoteFallback], ['remote', 'https://quant.example.com', 8443, 'NEW', true]);
  const fd = new dom.window.FormData(); fd.append('python', '/p');
  assert.equal('mode' in quantSettingsPayload(fd), false, 'a form without the engine-source field leaves mode / remote settings untouched');
});

test('引擎卡片：远程模式显示服务器地址与「测试连接」，回退时显示提示', () => {
  const st = {quant: {mode: 'remote', status: 'running', fellBack: true, remote: {url: 'https://quant.example.com', port: 8443, hasToken: true, fallback: true}, pool: []}};
  const html = quantPage(st, {action: (t, id) => `<button data-action="${id}">${t}</button>`, heading: () => '', empty: () => '', date: () => ''});
  assert.match(html, /quant\.example\.com:8443/);
  assert.match(html, /data-action="quantTestRemote"/);
  assert.match(html, /已切换到本地引擎/);
  assert.ok(!/data-action="quantSync"/.test(html));
});
